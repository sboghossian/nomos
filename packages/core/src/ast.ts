/**
 * Nomos AST.
 *
 * A discriminated-union AST. Every node carries a `kind` and a source span
 * for error reporting. The AST is deliberately small in v0.0.1 — we add
 * nodes as the language grows, not upfront.
 *
 * Naming convention: node `kind` is PascalCase matching the grammar rule.
 */

// ─── Source spans ──────────────────────────────────────────────────────────
export interface Span {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  startOffset: number;
  endOffset: number;
}

export interface Node {
  kind: string;
  span: Span;
}

// ─── Program ───────────────────────────────────────────────────────────────
export interface Program extends Node {
  kind: "Program";
  declarations: Declaration[];
}

export type Declaration =
  | TypeDecl
  | RuleDecl
  | FactDecl
  | QueryDecl
  | PredicateDecl;

/**
 * A user-defined predicate — a named boolean function of one argument.
 *
 *   predicate reasonable_scope(g: Geography) = g.reasonable && g.region != "worldwide"
 *
 * Usage:
 *   - As a member of `is`:  `clause.scope is reasonable_scope`
 *   - As a call:            `reasonable_scope(clause.scope)`
 *
 * In both cases the argument is substituted for `g` and the body is
 * evaluated. v0 supports single-parameter predicates; multi-param arrives
 * when we need it.
 */
export interface PredicateDecl extends Node {
  kind: "PredicateDecl";
  name: string;
  param: string;
  paramType: TypeRef | null;
  body: Expression;
}

// ─── Types ─────────────────────────────────────────────────────────────────
export interface TypeDecl extends Node {
  kind: "TypeDecl";
  name: string;
  fields: TypeField[];
}

export interface TypeField extends Node {
  kind: "TypeField";
  name: string;
  type: TypeRef;
}

export type TypeRef = NamedType | UnionType | GenericType;

export interface NamedType extends Node {
  kind: "NamedType";
  name: string;
}

export interface UnionType extends Node {
  kind: "UnionType";
  /** e.g. "seller" | "buyer" — string literals form the union. */
  variants: string[];
}

export interface GenericType extends Node {
  kind: "GenericType";
  /** e.g. List<Party> → base="List", args=[Party] */
  base: string;
  args: TypeRef[];
}

// ─── Rules ─────────────────────────────────────────────────────────────────
export interface RuleDecl extends Node {
  kind: "RuleDecl";
  name: string;
  /** @FR — ISO 3166 country code or a user-defined jurisdiction name */
  jurisdiction: string | null;
  /** `from <date>` — inclusive lower bound of temporal validity */
  from: string | null;
  /** `priority N` — higher wins; default 0 */
  priority: number;
  /** rules this one defeats by name */
  defeats: string[];
  /** `when <expr>` — guard clause */
  when: Expression | null;
  /** body: requires-clauses and authority declarations */
  requires: Expression[];
  authorities: AuthorityRef[];
}

/**
 * A reference to a legal authority — a statute article, a case, a decree.
 *
 * The `source` is the authority publisher (e.g. `code_du_travail`, `cass_soc`,
 * `code_conso`). The `kind` tells the resolver what shape to expect:
 *
 *   - `article` — a statute article: `code_du_travail.art("L1121-1")`
 *   - `case`    — a judicial decision: `cass_soc(2002-07-10, "00-45135")`
 *   - `section` — a clause/section of a document: `policy.section("7.2")`
 *   - `decree`  — an executive decree with a date + number
 *   - `generic` — any other shape; we keep the args raw for now
 *
 * This lets the pretty-printer and the future citation-resolver do their job
 * without string-surgery. Nomos doesn't commit to any one jurisdiction's
 * citation format — publishers are user-named identifiers.
 */
export interface AuthorityRef extends Node {
  kind: "AuthorityRef";
  /** The publisher/source name (e.g. "code_du_travail", "cass_soc"). */
  source: string;
  /** Shape of the citation. */
  citationKind: "article" | "case" | "section" | "decree" | "generic";
  /** Primary identifier: article number, case number, section id. */
  primary: string;
  /** Optional date: case decision date, decree date. ISO YYYY-MM-DD. */
  date: string | null;
  /** Any remaining positional arguments we don't yet have a typed slot for. */
  extra: string[];
  /** Canonical string form — used by resolvers and as a stable hash. */
  canonical: string;
}

// ─── Facts ─────────────────────────────────────────────────────────────────
export interface FactDecl extends Node {
  kind: "FactDecl";
  name: string;
  typeAnnotation: TypeRef | null;
  value: Expression;
}

// ─── Queries ───────────────────────────────────────────────────────────────
export interface QueryDecl extends Node {
  kind: "QueryDecl";
  expression: Expression;
  /** `as of <date>` — temporal query pin */
  asOf: string | null;
}

// ─── Expressions ───────────────────────────────────────────────────────────
export type Expression =
  | NumberLit
  | StringLit
  | BoolLit
  | DateLit
  | DurationLit
  | IdentExpr
  | MemberExpr
  | CallExpr
  | IndexExpr
  | BinaryExpr
  | UnaryExpr
  | ExtractExpr
  | IsExpr;

export interface NumberLit extends Node {
  kind: "NumberLit";
  value: number;
}

export interface StringLit extends Node {
  kind: "StringLit";
  value: string;
}

export interface BoolLit extends Node {
  kind: "BoolLit";
  value: boolean;
}

export interface DateLit extends Node {
  kind: "DateLit";
  value: string; // ISO YYYY-MM-DD
}

/**
 * A duration literal — `18.months`, `2.years`, `30.days`, `6.weeks`.
 * Parsed from <Number>.<unit> sugar. The canonical runtime value is
 * months (Float) so Duration-annotated fields compare as numbers.
 */
export interface DurationLit extends Node {
  kind: "DurationLit";
  /** How the user wrote it — used in error messages and pretty-printing. */
  rawValue: number;
  unit: "day" | "week" | "month" | "year";
  /** Canonical value in months (may be fractional for days/weeks). */
  months: number;
}

export interface IdentExpr extends Node {
  kind: "IdentExpr";
  name: string;
}

export interface MemberExpr extends Node {
  kind: "MemberExpr";
  object: Expression;
  property: string;
}

export interface CallExpr extends Node {
  kind: "CallExpr";
  callee: Expression;
  args: Expression[];
}

export interface IndexExpr extends Node {
  kind: "IndexExpr";
  object: Expression;
  index: Expression;
}

export interface BinaryExpr extends Node {
  kind: "BinaryExpr";
  op: "==" | "!=" | "<=" | ">=" | "<" | ">" | "&&" | "||";
  left: Expression;
  right: Expression;
}

/**
 * Unary prefix: `not x`, `!x`. In practice always boolean negation for now.
 * Parens may wrap any sub-expression.
 */
export interface UnaryExpr extends Node {
  kind: "UnaryExpr";
  op: "!";
  operand: Expression;
}

/**
 * `extract<T>(source) using llm(model) verified_by human if confidence < N`
 *
 * The LLM bridge — Nomos's defining primitive. Parsed into a distinct node
 * so later phases can type-check, schedule, and route it independently.
 */
export interface ExtractExpr extends Node {
  kind: "ExtractExpr";
  targetType: TypeRef;
  source: Expression;
  /** named keyword args passed to extract, e.g. section: "non-compete" */
  kwargs: { name: string; value: Expression }[];
  using: LlmCall | null;
  verifiedByHuman: boolean;
  /** confidence threshold below which a human is asked */
  confidenceThreshold: number | null;
}

export interface LlmCall extends Node {
  kind: "LlmCall";
  model: string;
}

/** `x is reasonable` — identifier-level predicate; kept simple for now. */
export interface IsExpr extends Node {
  kind: "IsExpr";
  subject: Expression;
  predicate: string;
}
