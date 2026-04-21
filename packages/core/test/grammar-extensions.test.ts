/**
 * Tests for the grammar extensions shipped after v0.1.0:
 *   - negation operators (`not`, `!`) + `!=`
 *   - duration literals (18.months, 2.years, 30.days, 6.weeks)
 *   - user-defined predicates (both `is name` and `name(x)` forms)
 *
 * These lock in behavior so the next grammar change announces itself.
 */

import { describe, expect, it } from "vitest";
import { parse, evaluate, envFromJson, check } from "../src/index.js";

function mustParse(src: string) {
  const r = parse(src);
  if (r.lexErrors.length || r.parseErrors.length) {
    throw new Error(
      "parse failed:\n" +
        [...r.lexErrors, ...r.parseErrors]
          .map((e) => `  [${e.line}:${e.column}] ${e.message}`)
          .join("\n"),
    );
  }
  return r.ast!;
}

function run(
  src: string,
  facts: Record<string, unknown> = {},
  asOf = "2026-04-18",
) {
  const program = mustParse(src);
  check(program);
  const q = program.declarations.find((d) => d.kind === "QueryDecl");
  if (!q || q.kind !== "QueryDecl") throw new Error("no query");
  return evaluate(program, q, envFromJson(facts, asOf));
}

// ─── Negation ──────────────────────────────────────────────────────────────

describe("negation", () => {
  it("`not x` parses as UnaryExpr with op='!'", () => {
    const ast = mustParse(`rule r { requires not party.is_minor } query r`);
    const rule = ast.declarations[0]!;
    if (rule.kind !== "RuleDecl") throw new Error("shape");
    const e = rule.requires[0]!;
    expect(e.kind).toBe("UnaryExpr");
    if (e.kind !== "UnaryExpr") return;
    expect(e.op).toBe("!");
    expect(e.operand.kind).toBe("MemberExpr");
  });

  it("`!x` is the same AST as `not x`", () => {
    const a = mustParse(`rule r { requires not party.x } query r`);
    const b = mustParse(`rule r { requires !party.x } query r`);
    const ea = (a.declarations[0] as any).requires[0];
    const eb = (b.declarations[0] as any).requires[0];
    expect(ea.kind).toBe("UnaryExpr");
    expect(eb.kind).toBe("UnaryExpr");
    expect(ea.op).toBe(eb.op);
    expect(ea.operand.kind).toBe(eb.operand.kind);
  });

  it("negation flips truthiness at eval time", () => {
    const src = `rule r { requires not party.is_minor } query r`;
    expect(run(src, { party: { is_minor: true } }).value).toEqual({
      kind: "bool",
      value: false,
    });
    expect(run(src, { party: { is_minor: false } }).value).toEqual({
      kind: "bool",
      value: true,
    });
  });
});

// ─── != operator ───────────────────────────────────────────────────────────

describe("!= operator", () => {
  it("parses as BinaryExpr op='!='", () => {
    const ast = mustParse(
      `rule r { requires party.role != "consumer" } query r`,
    );
    const e = (ast.declarations[0] as any).requires[0];
    expect(e.kind).toBe("BinaryExpr");
    expect(e.op).toBe("!=");
  });

  it("evaluates as strict inequality", () => {
    const src = `rule r { requires party.role != "consumer" } query r`;
    expect(run(src, { party: { role: "employee" } }).value).toEqual({
      kind: "bool",
      value: true,
    });
    expect(run(src, { party: { role: "consumer" } }).value).toEqual({
      kind: "bool",
      value: false,
    });
  });
});

// ─── Duration literals ─────────────────────────────────────────────────────

describe("duration literals", () => {
  it("`18.months` parses to DurationLit with months=18", () => {
    const ast = mustParse(
      `rule r { requires clause.duration <= 18.months } query r`,
    );
    const e = (ast.declarations[0] as any).requires[0];
    expect(e.kind).toBe("BinaryExpr");
    expect(e.right.kind).toBe("DurationLit");
    expect(e.right.rawValue).toBe(18);
    expect(e.right.unit).toBe("month");
    expect(e.right.months).toBe(18);
  });

  it("`2.years` = 24 months", () => {
    const ast = mustParse(`fact x = 2.years`);
    const d = ast.declarations[0]!;
    if (d.kind !== "FactDecl") throw new Error("shape");
    expect(d.value.kind).toBe("DurationLit");
    if (d.value.kind !== "DurationLit") return;
    expect(d.value.months).toBe(24);
    expect(d.value.unit).toBe("year");
  });

  it("days/weeks convert to fractional months", () => {
    const ast = mustParse(`fact a = 30.days   fact b = 4.weeks`);
    const [a, b] = ast.declarations as any[];
    expect(Math.abs(a.value.months - 1)).toBeLessThan(0.0001);
    // 4 weeks = 28 days = 28/30 months ≈ 0.933
    expect(Math.abs(b.value.months - 28 / 30)).toBeLessThan(0.0001);
  });

  it("duration evaluates to a Number value (months) so comparisons work", () => {
    const r = run(`rule r { requires clause.duration <= 2.years } query r`, {
      clause: { duration: 18 },
    });
    expect(r.value).toEqual({ kind: "bool", value: true });
  });

  it("normal numeric identifiers still parse as MemberExpr, not DurationLit", () => {
    const ast = mustParse(`fact x = party.foo`);
    const d = ast.declarations[0]!;
    if (d.kind !== "FactDecl") throw new Error("shape");
    expect(d.value.kind).toBe("MemberExpr"); // `party.foo` is not a duration
  });
});

// ─── User-defined predicates ───────────────────────────────────────────────

describe("user-defined predicates", () => {
  const src = `
    predicate reasonable_scope(g) = g.reasonable && g.region != "worldwide"
    predicate adult(age) = age >= 18

    rule enforceable {
      requires clause.scope is reasonable_scope
      requires adult(party.age)
    }
    query enforceable
  `;

  it("registers predicates in the symbol table", () => {
    const ast = mustParse(src);
    const parsed = check(ast);
    expect(parsed.symbols.predicates.has("reasonable_scope")).toBe(true);
    expect(parsed.symbols.predicates.has("adult")).toBe(true);
  });

  it("`is pred_name` invokes the predicate", () => {
    expect(
      run(src, {
        clause: { scope: { reasonable: true, region: "EU" } },
        party: { age: 30 },
      }).value,
    ).toEqual({ kind: "bool", value: true });

    expect(
      run(src, {
        clause: { scope: { reasonable: true, region: "worldwide" } },
        party: { age: 30 },
      }).value,
    ).toEqual({ kind: "bool", value: false });
  });

  it("`pred_name(x)` call form works too", () => {
    expect(
      run(src, {
        clause: { scope: { reasonable: true, region: "EU" } },
        party: { age: 12 },
      }).value,
    ).toEqual({ kind: "bool", value: false });

    expect(
      run(src, {
        clause: { scope: { reasonable: true, region: "EU" } },
        party: { age: 18 },
      }).value,
    ).toEqual({ kind: "bool", value: true });
  });

  it("does not clobber the field-access fallback for `is`", () => {
    // When the predicate name isn't declared, fall back to object field.
    // Bind `x` directly so the IdentExpr resolves to the right object.
    const r1 = run(`rule r { requires x is flag } query r`, {
      x: { flag: true },
    });
    expect(r1.value).toEqual({ kind: "bool", value: true });
    const r2 = run(`rule r { requires x is flag } query r`, {
      x: { flag: false },
    });
    expect(r2.value).toEqual({ kind: "bool", value: false });
  });
});

// ─── Fact-value surfacing on failing requirements ─────────────────────────

describe("operand surfacing", () => {
  it("failing requirement carries per-operand values", () => {
    const r = run(`rule r { requires clause.x >= 10 } query r`, {
      clause: { x: 3 },
    });
    const req = r.traces[0]!.requirements[0]!;
    expect(req.satisfied).toBe(false);
    expect(req.operands.length).toBe(2);
    const names = req.operands.map((o) => o.expr);
    expect(names).toContain("clause.x");
    const clauseOp = req.operands.find((o) => o.expr === "clause.x")!;
    expect(clauseOp.value).toEqual({ kind: "number", value: 3 });
  });

  it("compound &&/|| operands recurse into both sides", () => {
    const r = run(`rule r { requires x > 0 && y > 0 } query r`, {
      x: 5,
      y: -1,
    });
    const req = r.traces[0]!.requirements[0]!;
    // Both sides should appear in operands.
    const exprs = req.operands.map((o) => o.expr);
    expect(exprs.some((e) => e.includes("x"))).toBe(true);
    expect(exprs.some((e) => e.includes("y"))).toBe(true);
  });
});
