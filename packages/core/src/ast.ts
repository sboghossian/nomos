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

export type Declaration = TypeDecl | RuleDecl | FactDecl | QueryDecl;

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

export interface AuthorityRef extends Node {
  kind: "AuthorityRef";
  /** free-form source reference string — parsed fully in a later phase */
  raw: string;
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
  | IdentExpr
  | MemberExpr
  | CallExpr
  | IndexExpr
  | BinaryExpr
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
  op: "==" | "<=" | ">=" | "<" | ">" | "&&" | "||";
  left: Expression;
  right: Expression;
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
