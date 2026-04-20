/**
 * Evaluator fixtures: rule engine + defeasibility solver.
 *
 * Each test loads a .nomos fixture (from test/fixtures/) and optionally a
 * sibling .input.json, runs the full pipeline, and asserts on the verdict
 * + tiebreaker.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { check, evaluate, envFromJson, parse } from "../src/index.js";

function loadFixture(name: string, inputs?: Record<string, unknown>) {
  const src = readFileSync(
    new URL(`./fixtures/${name}.nomos`, import.meta.url),
    "utf8",
  );
  const parsed = parse(src);
  if (!parsed.ast) throw new Error("parse failed");
  check(parsed.ast);
  const query = parsed.ast.declarations.find((d) => d.kind === "QueryDecl");
  if (!query || query.kind !== "QueryDecl") throw new Error("no query");
  const env = envFromJson(inputs ?? {}, query.asOf ?? "2026-04-18");
  return evaluate(parsed.ast, query, env);
}

// ─── Scenario matrix for the French non-compete ────────────────────────────

describe("French non-compete (non_compete_fr)", () => {
  const base = {
    parties: [{ name: "Alice", role: "employee" }],
    party: { name: "Alice", role: "employee" },
    clause: {
      duration: 18,
      scope: { reasonable: true },
      compensation_pct: 0.35,
    },
  };

  it("fair terms → ENFORCEABLE", () => {
    const r = loadFixture("non_compete_fr", base);
    expect(r.value).toEqual({ kind: "bool", value: true });
    expect(r.winningRule).toBe("non_compete_enforceable");
    expect(r.defeatedRules).toEqual([]);
  });

  it("consumer role → consumer_protection_override defeats", () => {
    const r = loadFixture("non_compete_fr", {
      ...base,
      party: { name: "Alice", role: "consumer" },
    });
    expect(r.value).toEqual({ kind: "bool", value: false });
    expect(r.winningRule).toBe("consumer_protection_override");
    expect(r.defeatedRules).toEqual(["non_compete_enforceable"]);
    expect(r.tiebreaker?.decidedBy).toBe("priority");
  });

  it("underpaid (12%) → no rule fires → verdict FALSE", () => {
    const r = loadFixture("non_compete_fr", {
      ...base,
      clause: { ...base.clause, compensation_pct: 0.12 },
    });
    expect(r.value).toEqual({ kind: "bool", value: false });
    expect(r.winningRule).toBeNull();
    // The base rule's compensation requirement should be the failing one.
    const trace = r.traces.find((t) => t.rule === "non_compete_enforceable")!;
    const comp = trace.requirements.find((x) =>
      x.clause.includes("compensation_pct"),
    );
    expect(comp?.satisfied).toBe(false);
  });

  it("carries authorities in canonical form", () => {
    const r = loadFixture("non_compete_fr", base);
    expect(r.authorities).toContain('code_du_travail.art("L1121-1")');
    expect(r.authorities.some((a) => a.startsWith("cass_soc("))).toBe(true);
  });
});

// ─── Temporal validity ─────────────────────────────────────────────────────

describe("temporal validity", () => {
  const base = {
    parties: [{ name: "Alice", role: "employee" }],
    party: { name: "Alice", role: "employee" },
    clause: {
      duration: 18,
      scope: { reasonable: true },
      compensation_pct: 0.35,
    },
  };

  it("as of 2015 (pre-reform) → rule skipped → no fire", () => {
    const src = readFileSync(
      new URL("./fixtures/non_compete_fr.nomos", import.meta.url),
      "utf8",
    );
    const ast = parse(src).ast!;
    const query = ast.declarations.find((d) => d.kind === "QueryDecl")!;
    if (query.kind !== "QueryDecl") throw new Error("shape");
    const env = envFromJson(base, "2015-01-01");
    const r = evaluate(ast, query, env);

    expect(r.value).toEqual({ kind: "bool", value: false });
    const baseTrace = r.traces.find(
      (t) => t.rule === "non_compete_enforceable",
    )!;
    expect(baseTrace.skippedReason).toMatch(/valid only from/);
  });
});

// ─── Defeasibility by specificity ──────────────────────────────────────────

describe("lex specialis (same priority, different specificity)", () => {
  it("more-constrained rule wins; tiebreaker = specificity", () => {
    const r = loadFixture("tiebreaker", {
      employee: { role: "CTO", seniority_years: 8, is_executive: true },
    });
    expect(r.winningRule).toBe("executive_thirty_days");
    expect(r.defeatedRules).toEqual(["two_weeks_notice"]);
    expect(r.tiebreaker?.decidedBy).toBe("specificity");
    // executive rule: 1 require + 1 when + 1 defeats = 4; general: 1 require = 1
    const winnerScore = r.tiebreaker!.candidates[0]!.specificity;
    const runnerScore = r.tiebreaker!.candidates[1]!.specificity;
    expect(winnerScore).toBeGreaterThan(runnerScore);
  });
});

// ─── Provenance ────────────────────────────────────────────────────────────

describe("provenance", () => {
  it("proof tree names every requirement with its boolean result", () => {
    const r = loadFixture("non_compete_fr", {
      parties: [{ name: "Alice", role: "employee" }],
      party: { name: "Alice", role: "employee" },
      clause: {
        duration: 18,
        scope: { reasonable: true },
        compensation_pct: 0.35,
      },
    });
    const trace = r.traces.find((t) => t.rule === "non_compete_enforceable")!;
    expect(trace.requirements).toHaveLength(3);
    expect(trace.requirements.every((x) => x.satisfied)).toBe(true);
    expect(trace.requirements[0]!.clause).toMatch(/duration/);
    expect(trace.requirements[1]!.clause).toMatch(/scope is reasonable/);
    expect(trace.requirements[2]!.clause).toMatch(/compensation_pct/);
  });

  it("asOf is echoed back in the result", () => {
    const r = loadFixture("non_compete_fr", {
      parties: [{ name: "Alice", role: "employee" }],
      party: { name: "Alice", role: "employee" },
      clause: {
        duration: 18,
        scope: { reasonable: true },
        compensation_pct: 0.35,
      },
    });
    expect(r.asOf).toBe("2026-04-18");
  });
});
