/**
 * Nomos evaluator (v0 — happy path + priority-based defeasibility).
 *
 * Given a parsed Program and an input Environment of fact bindings (JSON),
 * this evaluator:
 *
 *  1. Resolves the query's target rule by name.
 *  2. Finds all rules that might `defeats` the target (candidates).
 *  3. Evaluates each candidate's `when` guard + `requires` clauses.
 *  4. Resolves conflicts by priority: if a higher-priority defeater fires,
 *     the target is considered defeated (value = false, winningRule = defeater).
 *  5. Otherwise evaluates the target rule's requires; if all pass, result = true.
 *  6. Temporal validity: a rule with `from <date>` only applies if the query's
 *     `as of <date>` (or today) is >= that date.
 *  7. Every result carries a provenance chain — authorities, facts used,
 *     defeated rules — so callers can render a proof tree.
 *
 * v0 deliberately keeps specificity and recency out of scope. They arrive in
 * the next pass.
 */

import type {
  BinaryExpr,
  Expression,
  Program,
  QueryDecl,
  RuleDecl,
} from "./ast.js";

// ─── Values ────────────────────────────────────────────────────────────────

export type Value =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "date"; value: string }
  | { kind: "object"; value: Record<string, Value> }
  | { kind: "list"; value: Value[] }
  | { kind: "null" };

export const nullVal: Value = { kind: "null" };

// ─── Environment ───────────────────────────────────────────────────────────

export interface Env {
  /** Fact bindings, keyed by declaration name. Provided externally as JSON. */
  facts: Map<string, Value>;
  /** The query's `as of` date, or today. ISO YYYY-MM-DD. */
  asOf: string;
}

// ─── Result + provenance ───────────────────────────────────────────────────

export interface RuleTrace {
  rule: string;
  satisfied: boolean;
  /** Why — each requires clause's result + a human-readable snippet. */
  requirements: { clause: string; satisfied: boolean; value: Value }[];
  /** Authority citation strings from the rule. */
  authorities: string[];
  /** Reason the rule didn't apply, if applicable (out of temporal range, etc.). */
  skippedReason?: string;
}

export interface EvalResult {
  /** The final value of the query — true/false for predicate rules. */
  value: Value;
  /** The rule whose verdict carried. */
  winningRule: string | null;
  /** Rules that were defeated by the winner (if any). */
  defeatedRules: string[];
  /** Authorities backing the winning rule. */
  authorities: string[];
  /** Every candidate rule and how it fared — the proof tree, flattened. */
  traces: RuleTrace[];
  /** As-of date used for temporal resolution. */
  asOf: string;
  /**
   * Why the winner won: human-readable explanation of the defeasibility
   * resolution. Undefined when only one rule fired (no conflict).
   */
  tiebreaker?: TiebreakerExplanation;
}

export interface TiebreakerExplanation {
  /** Rank-ordered candidates with their scores. */
  candidates: {
    rule: string;
    priority: number;
    specificity: number;
    from: string | null;
    declIndex: number;
  }[];
  /** Which criterion decided the contest: priority, specificity, recency, lex posterior. */
  decidedBy: "priority" | "specificity" | "recency" | "lex-posterior";
  /** Short sentence describing the winning margin. */
  summary: string;
}

// ─── Entry point ───────────────────────────────────────────────────────────

export function evaluate(
  program: Program,
  query: QueryDecl,
  env: Env,
): EvalResult {
  // The v0 query shape is a bare identifier referring to a rule name.
  // (Call-syntax queries like `rule(args)` arrive with explicit rule params.)
  const target = resolveQueryTarget(query);
  if (!target) {
    return {
      value: { kind: "bool", value: false },
      winningRule: null,
      defeatedRules: [],
      authorities: [],
      traces: [],
      asOf: env.asOf,
    };
  }

  const rules = program.declarations.filter(
    (d): d is RuleDecl => d.kind === "RuleDecl",
  );
  const targetRule = rules.find((r) => r.name === target);
  if (!targetRule) {
    return {
      value: { kind: "bool", value: false },
      winningRule: null,
      defeatedRules: [],
      authorities: [],
      traces: [
        {
          rule: target,
          satisfied: false,
          requirements: [],
          authorities: [],
          skippedReason: `rule "${target}" is not declared`,
        },
      ],
      asOf: env.asOf,
    };
  }

  // Candidates: the target rule itself plus any rule that declares
  // `defeats <target>` (defeaters get priority via their priority field).
  const defeaters = rules.filter((r) => r.defeats.includes(target));
  const candidates = [targetRule, ...defeaters];

  const traces: RuleTrace[] = [];
  const fired: { rule: RuleDecl; trace: RuleTrace }[] = [];

  for (const rule of candidates) {
    const trace = evaluateRule(rule, env);
    traces.push(trace);
    if (trace.satisfied && !trace.skippedReason) {
      fired.push({ rule, trace });
    }
  }

  if (fired.length === 0) {
    // Nothing fired — the base rule's requires weren't met and no
    // defeater applies. Value = false with the target's trace.
    return {
      value: { kind: "bool", value: false },
      winningRule: null,
      defeatedRules: [],
      authorities: [],
      traces,
      asOf: env.asOf,
    };
  }

  // ─── Defeasibility resolution ───────────────────────────────────────
  //
  // Classical legal maxims, in descending precedence:
  //   1. Priority    — user-declared `priority N`. Higher wins.
  //   2. Specificity — lex specialis. More requires/when/defeats → more specific.
  //   3. Recency     — lex posterior. Later `from` date wins.
  //   4. Decl order  — last-declared wins (final fallback).
  //
  // Each fired candidate gets a composite score, we sort, we record which
  // criterion decided it so the UI can show a proof of the tiebreak itself.

  const ruleIndex = new Map(rules.map((r, i) => [r.name, i]));

  const scored = fired.map(({ rule, trace }) => ({
    rule,
    trace,
    priority: rule.priority,
    specificity: specificityOf(rule),
    from: rule.from,
    declIndex: ruleIndex.get(rule.name) ?? 0,
  }));

  scored.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.specificity !== b.specificity) return b.specificity - a.specificity;
    // Compare `from` lexicographically (ISO dates are lexicographic-sortable).
    // Rules without a `from` get ranked as older (loses the tiebreak).
    const af = a.from ?? "";
    const bf = b.from ?? "";
    if (af !== bf) return bf.localeCompare(af);
    return b.declIndex - a.declIndex;
  });

  const winner = scored[0]!;
  const targetIsWinner = winner.rule.name === target;
  const defeated: string[] = [];
  if (!targetIsWinner && winner.rule.defeats.includes(target)) {
    defeated.push(target);
  }

  // Build the tiebreaker explanation only when there's a real conflict.
  let tiebreaker: TiebreakerExplanation | undefined;
  if (scored.length > 1) {
    const runner = scored[1]!;
    let decidedBy: TiebreakerExplanation["decidedBy"] = "lex-posterior";
    let summary = "";
    if (winner.priority !== runner.priority) {
      decidedBy = "priority";
      summary = `"${winner.rule.name}" priority ${winner.priority} beats "${runner.rule.name}" priority ${runner.priority}.`;
    } else if (winner.specificity !== runner.specificity) {
      decidedBy = "specificity";
      summary = `lex specialis — "${winner.rule.name}" is more specific (${winner.specificity} signals) than "${runner.rule.name}" (${runner.specificity}).`;
    } else if ((winner.from ?? "") !== (runner.from ?? "")) {
      decidedBy = "recency";
      summary = `lex posterior — "${winner.rule.name}" (from ${winner.from ?? "—"}) is more recent than "${runner.rule.name}" (from ${runner.from ?? "—"}).`;
    } else {
      summary = `tied on priority/specificity/recency — last-declared wins: "${winner.rule.name}".`;
    }
    tiebreaker = {
      candidates: scored.map((s) => ({
        rule: s.rule.name,
        priority: s.priority,
        specificity: s.specificity,
        from: s.from,
        declIndex: s.declIndex,
      })),
      decidedBy,
      summary,
    };
  }

  const result: EvalResult = {
    value: { kind: "bool", value: targetIsWinner },
    winningRule: winner.rule.name,
    defeatedRules: defeated,
    authorities: winner.trace.authorities,
    traces,
    asOf: env.asOf,
  };
  if (tiebreaker) result.tiebreaker = tiebreaker;
  return result;
}

/**
 * Specificity score — a rough proxy for "how narrow is this rule".
 * More signals → higher specificity → wins lex-specialis tiebreaks.
 *
 *   requires clause      +1 each
 *   when guard           +2 (a hard precondition on context)
 *   defeats declaration  +1 each (explicit override signals specificity)
 */
function specificityOf(rule: RuleDecl): number {
  return rule.requires.length + (rule.when ? 2 : 0) + rule.defeats.length;
}

// ─── Rule evaluation ───────────────────────────────────────────────────────

function evaluateRule(rule: RuleDecl, env: Env): RuleTrace {
  const base: RuleTrace = {
    rule: rule.name,
    satisfied: false,
    requirements: [],
    authorities: rule.authorities.map((a) => a.canonical),
  };

  // Temporal validity: if the rule has a `from` date, skip when the query
  // is before it.
  if (rule.from && env.asOf < rule.from) {
    return {
      ...base,
      skippedReason: `rule valid only from ${rule.from}; query as of ${env.asOf}`,
    };
  }

  // `when` guard. If present, must evaluate to truthy.
  if (rule.when) {
    const guardValue = evaluateExpression(rule.when, env);
    if (!isTruthy(guardValue)) {
      return {
        ...base,
        skippedReason: `when-guard failed`,
        requirements: [
          { clause: snippet(rule.when), satisfied: false, value: guardValue },
        ],
      };
    }
  }

  // requires clauses — all must pass.
  const requirements: RuleTrace["requirements"] = [];
  let allSatisfied = true;
  for (const req of rule.requires) {
    const v = evaluateExpression(req, env);
    const ok = isTruthy(v);
    requirements.push({ clause: snippet(req), satisfied: ok, value: v });
    if (!ok) allSatisfied = false;
  }

  return {
    ...base,
    satisfied: allSatisfied,
    requirements,
  };
}

// ─── Expression evaluator ──────────────────────────────────────────────────

export function evaluateExpression(expr: Expression, env: Env): Value {
  switch (expr.kind) {
    case "NumberLit":
      return { kind: "number", value: expr.value };
    case "StringLit":
      return { kind: "string", value: expr.value };
    case "BoolLit":
      return { kind: "bool", value: expr.value };
    case "DateLit":
      return { kind: "date", value: expr.value };

    case "IdentExpr": {
      const f = env.facts.get(expr.name);
      if (f) return f;
      // Unbound identifier → null (with a trace-friendly shape).
      return nullVal;
    }

    case "MemberExpr": {
      const obj = evaluateExpression(expr.object, env);
      if (obj.kind !== "object") return nullVal;
      return obj.value[expr.property] ?? nullVal;
    }

    case "IndexExpr": {
      const obj = evaluateExpression(expr.object, env);
      const idx = evaluateExpression(expr.index, env);
      if (obj.kind === "list" && idx.kind === "number") {
        return obj.value[idx.value] ?? nullVal;
      }
      if (obj.kind === "object" && idx.kind === "string") {
        return obj.value[idx.value] ?? nullVal;
      }
      return nullVal;
    }

    case "CallExpr":
      // v0: calls in expression position are not yet invoked (they're only
      // used in `authority:` citations, which we stringify separately).
      return nullVal;

    case "BinaryExpr":
      return evaluateBinary(expr, env);

    case "IsExpr": {
      // `x is reasonable` → x.reasonable truthy?
      const subj = evaluateExpression(expr.subject, env);
      if (subj.kind === "object") {
        const v = subj.value[expr.predicate];
        return { kind: "bool", value: v ? isTruthy(v) : false };
      }
      // Fallback: treat as explicit boolean flag in env under dotted key.
      return { kind: "bool", value: false };
    }

    case "ExtractExpr":
      // Not runnable without an LLM. Evaluator expects the *value* to already
      // be bound in env.facts by the host; if we get here, the host didn't
      // bind it and we return null.
      return nullVal;
  }
}

function evaluateBinary(expr: BinaryExpr, env: Env): Value {
  const left = evaluateExpression(expr.left, env);
  const right = evaluateExpression(expr.right, env);

  if (expr.op === "&&")
    return { kind: "bool", value: isTruthy(left) && isTruthy(right) };
  if (expr.op === "||")
    return { kind: "bool", value: isTruthy(left) || isTruthy(right) };

  const l = numeric(left);
  const r = numeric(right);

  if (expr.op === "==")
    return { kind: "bool", value: equalValues(left, right) };
  if (l !== null && r !== null) {
    if (expr.op === "<=") return { kind: "bool", value: l <= r };
    if (expr.op === ">=") return { kind: "bool", value: l >= r };
    if (expr.op === "<") return { kind: "bool", value: l < r };
    if (expr.op === ">") return { kind: "bool", value: l > r };
  }
  return { kind: "bool", value: false };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function numeric(v: Value): number | null {
  if (v.kind === "number") return v.value;
  return null;
}

function equalValues(a: Value, b: Value): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "number" && b.kind === "number") return a.value === b.value;
  if (a.kind === "string" && b.kind === "string") return a.value === b.value;
  if (a.kind === "bool" && b.kind === "bool") return a.value === b.value;
  if (a.kind === "date" && b.kind === "date") return a.value === b.value;
  return false;
}

function isTruthy(v: Value): boolean {
  switch (v.kind) {
    case "bool":
      return v.value;
    case "number":
      return v.value !== 0;
    case "string":
      return v.value.length > 0;
    case "list":
      return v.value.length > 0;
    case "object":
      return Object.keys(v.value).length > 0;
    case "date":
      return true;
    case "null":
      return false;
  }
}

/** Short human-readable snippet of an expression (for traces). */
function snippet(expr: Expression): string {
  switch (expr.kind) {
    case "NumberLit":
      return String(expr.value);
    case "StringLit":
      return JSON.stringify(expr.value);
    case "BoolLit":
      return String(expr.value);
    case "DateLit":
      return expr.value;
    case "IdentExpr":
      return expr.name;
    case "MemberExpr":
      return `${snippet(expr.object)}.${expr.property}`;
    case "BinaryExpr":
      return `${snippet(expr.left)} ${expr.op} ${snippet(expr.right)}`;
    case "IsExpr":
      return `${snippet(expr.subject)} is ${expr.predicate}`;
    case "CallExpr":
      return `${snippet(expr.callee)}(…)`;
    case "IndexExpr":
      return `${snippet(expr.object)}[${snippet(expr.index)}]`;
    case "ExtractExpr":
      return `extract<…>`;
  }
}

function resolveQueryTarget(query: QueryDecl): string | null {
  const e = query.expression;
  if (e.kind === "IdentExpr") return e.name;
  if (e.kind === "CallExpr" && e.callee.kind === "IdentExpr")
    return e.callee.name;
  return null;
}

// ─── JSON → Value ──────────────────────────────────────────────────────────

/**
 * Convert a plain-JSON value to a Nomos `Value`. Used to load fact bindings
 * from `.input.json` files.
 */
export function fromJson(json: unknown): Value {
  if (json === null || json === undefined) return nullVal;
  if (typeof json === "boolean") return { kind: "bool", value: json };
  if (typeof json === "number") return { kind: "number", value: json };
  if (typeof json === "string") {
    // Try to detect ISO dates.
    if (/^\d{4}-\d{2}-\d{2}$/.test(json)) return { kind: "date", value: json };
    return { kind: "string", value: json };
  }
  if (Array.isArray(json)) {
    return { kind: "list", value: json.map(fromJson) };
  }
  if (typeof json === "object") {
    const out: Record<string, Value> = {};
    for (const [k, v] of Object.entries(json as object)) out[k] = fromJson(v);
    return { kind: "object", value: out };
  }
  return nullVal;
}

/**
 * Load a plain object of fact bindings into an Env.
 */
export function envFromJson(
  bindings: Record<string, unknown>,
  asOf: string,
): Env {
  const facts = new Map<string, Value>();
  for (const [name, value] of Object.entries(bindings)) {
    facts.set(name, fromJson(value));
  }
  return { facts, asOf };
}
