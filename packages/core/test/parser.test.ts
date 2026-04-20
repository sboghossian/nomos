/**
 * Grammar fixtures for @nomos/core.
 *
 * Each test is a small program + a specific assertion on the parsed AST.
 * The goal is to lock in grammar shape before we expand: if one of these
 * breaks, we intended it (semver bump) or we regressed (fix).
 */

import { describe, expect, it } from "vitest";
import { parse } from "../src/parser.js";

// ─── helpers ───────────────────────────────────────────────────────────────

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

// ─── type declarations ─────────────────────────────────────────────────────

describe("types", () => {
  it("parses a primitive-only type", () => {
    const ast = mustParse(`type Party { name: String }`);
    expect(ast.declarations).toHaveLength(1);
    const d = ast.declarations[0]!;
    expect(d.kind).toBe("TypeDecl");
    if (d.kind !== "TypeDecl") throw new Error("shape");
    expect(d.name).toBe("Party");
    expect(d.fields[0]!.type.kind).toBe("NamedType");
  });

  it("parses a string-literal union", () => {
    const ast = mustParse(`type Role { value: "admin" | "user" | "guest" }`);
    const d = ast.declarations[0]!;
    if (d.kind !== "TypeDecl") throw new Error("shape");
    const t = d.fields[0]!.type;
    if (t.kind !== "UnionType") throw new Error("not a union");
    expect(t.variants).toEqual(["admin", "user", "guest"]);
  });

  it("parses a generic List<T>", () => {
    const ast = mustParse(`type Wrap { items: List<Party> }`);
    const d = ast.declarations[0]!;
    if (d.kind !== "TypeDecl") throw new Error("shape");
    const t = d.fields[0]!.type;
    if (t.kind !== "GenericType") throw new Error("not generic");
    expect(t.base).toBe("List");
    expect(t.args[0]!.kind).toBe("NamedType");
  });
});

// ─── rule declarations ─────────────────────────────────────────────────────

describe("rules", () => {
  it("parses a rule with all modifiers in any order", () => {
    const ast = mustParse(`
      rule r
        priority 10
        @ FR
        defeats other
        from 2020-01-01
        when x.y == "z"
      {
        requires 1 == 1
      }
      rule other { requires 0 == 0 }
    `);
    const r = ast.declarations[0]!;
    if (r.kind !== "RuleDecl") throw new Error("shape");
    expect(r.name).toBe("r");
    expect(r.jurisdiction).toBe("FR");
    expect(r.priority).toBe(10);
    expect(r.from).toBe("2020-01-01");
    expect(r.defeats).toEqual(["other"]);
    expect(r.when).not.toBeNull();
    expect(r.requires).toHaveLength(1);
  });

  it("defaults priority to 0 when omitted", () => {
    const ast = mustParse(`rule r { requires a == a }`);
    const r = ast.declarations[0]!;
    if (r.kind !== "RuleDecl") throw new Error("shape");
    expect(r.priority).toBe(0);
    expect(r.defeats).toEqual([]);
    expect(r.jurisdiction).toBeNull();
    expect(r.from).toBeNull();
  });

  it("parses multiple requires and authority clauses", () => {
    const ast = mustParse(`
      rule r {
        requires a >= 1
        requires b <= 2
        authority: src.art("L1")
        authority: src.art("L2")
      }
    `);
    const r = ast.declarations[0]!;
    if (r.kind !== "RuleDecl") throw new Error("shape");
    expect(r.requires).toHaveLength(2);
    expect(r.authorities).toHaveLength(2);
    expect(r.authorities[0]!.canonical).toBe('src.art("L1")');
    expect(r.authorities[0]!.citationKind).toBe("article");
  });
});

// ─── authority shapes ──────────────────────────────────────────────────────

describe("authorities", () => {
  it("classifies publisher.art(...) as article", () => {
    const ast = mustParse(`rule r { authority: code_du_travail.art("L1121-1") }`);
    const a = (ast.declarations[0] as any).authorities[0];
    expect(a.source).toBe("code_du_travail");
    expect(a.citationKind).toBe("article");
    expect(a.primary).toBe("L1121-1");
    expect(a.canonical).toBe('code_du_travail.art("L1121-1")');
  });

  it("classifies publisher(DATE, ID) as case", () => {
    const ast = mustParse(`rule r { authority: cass_soc(2002-07-10, "00-45135") }`);
    const a = (ast.declarations[0] as any).authorities[0];
    expect(a.source).toBe("cass_soc");
    expect(a.citationKind).toBe("case");
    expect(a.date).toBe("2002-07-10");
    expect(a.primary).toBe("00-45135");
  });

  it("classifies publisher.section(...) as section", () => {
    const ast = mustParse(`rule r { authority: policy.section("7.2") }`);
    const a = (ast.declarations[0] as any).authorities[0];
    expect(a.citationKind).toBe("section");
    expect(a.primary).toBe("7.2");
  });
});

// ─── facts ─────────────────────────────────────────────────────────────────

describe("facts", () => {
  it("parses a typed extract<T> with kwargs, using, and confidence", () => {
    const ast = mustParse(`
      fact clause: NonCompete = extract<NonCompete>(contract, section: "non-compete")
        using llm("claude-opus-4-7")
        verified_by human if confidence < 0.95
    `);
    const f = ast.declarations[0]!;
    if (f.kind !== "FactDecl") throw new Error("shape");
    const e = f.value;
    if (e.kind !== "ExtractExpr") throw new Error("not extract");
    expect(e.using!.model).toBe("claude-opus-4-7");
    expect(e.verifiedByHuman).toBe(true);
    expect(e.confidenceThreshold).toBe(0.95);
    expect(e.kwargs[0]!.name).toBe("section");
  });

  it("parses a bare fact = <identifier>", () => {
    const ast = mustParse(`fact party = some_binding`);
    const f = ast.declarations[0]!;
    if (f.kind !== "FactDecl") throw new Error("shape");
    expect(f.value.kind).toBe("IdentExpr");
    expect(f.typeAnnotation).toBeNull();
  });
});

// ─── expressions ───────────────────────────────────────────────────────────

describe("expressions", () => {
  it("parses `x is predicate`", () => {
    const ast = mustParse(`rule r { requires clause.scope is reasonable }`);
    const r = ast.declarations[0]!;
    if (r.kind !== "RuleDecl") throw new Error("shape");
    const e = r.requires[0]!;
    if (e.kind !== "IsExpr") throw new Error("shape");
    expect(e.predicate).toBe("reasonable");
  });

  it("parses chained member access + call", () => {
    const ast = mustParse(`fact x = a.b.c("arg")`);
    const d = ast.declarations[0]!;
    if (d.kind !== "FactDecl") throw new Error("shape");
    const call = d.value;
    if (call.kind !== "CallExpr") throw new Error("shape");
    expect(call.args).toHaveLength(1);
  });

  it("parses index access on lists", () => {
    const ast = mustParse(`fact x = parties[0]`);
    const d = ast.declarations[0]!;
    if (d.kind !== "FactDecl") throw new Error("shape");
    expect(d.value.kind).toBe("IndexExpr");
  });
});

// ─── queries ───────────────────────────────────────────────────────────────

describe("queries", () => {
  it("parses query with `as of DATE`", () => {
    const ast = mustParse(`query enforceable as of 2026-04-18`);
    const q = ast.declarations[0]!;
    if (q.kind !== "QueryDecl") throw new Error("shape");
    expect(q.asOf).toBe("2026-04-18");
  });

  it("parses bare query", () => {
    const ast = mustParse(`query r`);
    const q = ast.declarations[0]!;
    if (q.kind !== "QueryDecl") throw new Error("shape");
    expect(q.asOf).toBeNull();
  });
});

// ─── errors ────────────────────────────────────────────────────────────────

describe("errors", () => {
  it("reports lex errors gracefully", () => {
    const r = parse("rule r { requires ø == ø }");
    expect(r.lexErrors.length).toBeGreaterThan(0);
    expect(r.ast).toBeNull();
  });

  it("reports parse errors with location", () => {
    const r = parse("rule { requires 1 == 1 }"); // missing name
    expect(r.parseErrors.length).toBeGreaterThan(0);
    const e = r.parseErrors[0]!;
    expect(e.line).toBeGreaterThanOrEqual(0);
  });
});
