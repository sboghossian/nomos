/**
 * Nomos lexer tokens.
 *
 * Design choices:
 * - Keywords are reserved (cannot be used as identifiers).
 * - Comments: `//` line, `/* ... *‌/` block.
 * - Whitespace is insignificant (skipped).
 * - `@` prefixes annotations (jurisdiction, etc.).
 * - `from` introduces a temporal range; `as of` queries a point in time.
 *
 * This is the minimal token set for v0.0.1 — enough to parse the French
 * non-compete example. Operators like ∧ / ∨ and range arithmetic arrive
 * in later phases.
 */

import { createToken, Lexer } from "chevrotain";

// ─── Whitespace & comments (skipped) ───────────────────────────────────────
export const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /\s+/,
  group: Lexer.SKIPPED,
});

export const LineComment = createToken({
  name: "LineComment",
  pattern: /\/\/[^\n\r]*/,
  group: Lexer.SKIPPED,
});

export const BlockComment = createToken({
  name: "BlockComment",
  pattern: /\/\*[\s\S]*?\*\//,
  group: Lexer.SKIPPED,
});

// ─── Keywords ──────────────────────────────────────────────────────────────
// Chevrotain "longer alt" pattern: Identifier matches keywords too, then each
// keyword token claims priority over Identifier via `longer_alt`.
export const Identifier = createToken({
  name: "Identifier",
  pattern: /[a-zA-Z_][a-zA-Z0-9_]*/,
});

const kw = (name: string, pattern: string) =>
  createToken({
    name,
    pattern: new RegExp(`\\b${pattern}\\b`),
    longer_alt: Identifier,
  });

export const Type = kw("Type", "type");
export const Rule = kw("Rule", "rule");
export const Fact = kw("Fact", "fact");
export const Query = kw("Query", "query");
export const From = kw("From", "from");
export const As = kw("As", "as");
export const Of = kw("Of", "of");
export const Priority = kw("Priority", "priority");
export const Defeats = kw("Defeats", "defeats");
export const When = kw("When", "when");
export const Requires = kw("Requires", "requires");
export const Authority = kw("Authority", "authority");
export const Using = kw("Using", "using");
export const VerifiedBy = kw("VerifiedBy", "verified_by");
export const If = kw("If", "if");
export const Extract = kw("Extract", "extract");
export const Llm = kw("Llm", "llm");
export const Is = kw("Is", "is");
export const Human = kw("Human", "human");
export const True = kw("True", "true");
export const False = kw("False", "false");

// ─── Punctuation ───────────────────────────────────────────────────────────
export const LBrace = createToken({ name: "LBrace", pattern: /\{/ });
export const RBrace = createToken({ name: "RBrace", pattern: /\}/ });
export const LParen = createToken({ name: "LParen", pattern: /\(/ });
export const RParen = createToken({ name: "RParen", pattern: /\)/ });
export const LBracket = createToken({ name: "LBracket", pattern: /\[/ });
export const RBracket = createToken({ name: "RBracket", pattern: /\]/ });
export const LAngle = createToken({ name: "LAngle", pattern: /</ });
export const RAngle = createToken({ name: "RAngle", pattern: />/ });
export const Comma = createToken({ name: "Comma", pattern: /,/ });
export const Colon = createToken({ name: "Colon", pattern: /:/ });
export const Dot = createToken({ name: "Dot", pattern: /\./ });
export const At = createToken({ name: "At", pattern: /@/ });
export const Pipe = createToken({ name: "Pipe", pattern: /\|/ });
export const Equals = createToken({ name: "Equals", pattern: /=(?!=)/ });
export const DoubleEquals = createToken({
  name: "DoubleEquals",
  pattern: /==/,
});
export const LessEq = createToken({ name: "LessEq", pattern: /<=/ });
export const GreaterEq = createToken({ name: "GreaterEq", pattern: />=/ });
export const And = createToken({ name: "And", pattern: /∧|&&/ });
export const Or = createToken({ name: "Or", pattern: /∨|\|\|/ });

// ─── Literals ──────────────────────────────────────────────────────────────
// Order matters: DateLiteral before NumberLiteral so 2016-08-10 isn't parsed
// as `2016`, `-`, `8`, `-`, `10`.
export const DateLiteral = createToken({
  name: "DateLiteral",
  pattern: /\d{4}-\d{2}-\d{2}/,
});

export const NumberLiteral = createToken({
  name: "NumberLiteral",
  pattern: /\d+(\.\d+)?/,
});

export const StringLiteral = createToken({
  name: "StringLiteral",
  pattern: /"([^"\\]|\\.)*"/,
});

// ─── Token vector (order matters: longest/most-specific first) ─────────────
export const allTokens = [
  WhiteSpace,
  LineComment,
  BlockComment,

  // Keywords (before Identifier because Identifier is the fallback)
  Type,
  Rule,
  Fact,
  Query,
  From,
  As,
  Of,
  Priority,
  Defeats,
  When,
  Requires,
  Authority,
  Using,
  VerifiedBy,
  If,
  Extract,
  Llm,
  Is,
  Human,
  True,
  False,

  Identifier,

  // Multi-char punctuation before single-char
  DoubleEquals,
  LessEq,
  GreaterEq,

  // Literals
  DateLiteral,
  NumberLiteral,
  StringLiteral,

  // Single-char punctuation
  LBrace,
  RBrace,
  LParen,
  RParen,
  LBracket,
  RBracket,
  LAngle,
  RAngle,
  Comma,
  Colon,
  Dot,
  At,
  Pipe,
  Equals,
  And,
  Or,
];

export const nomosLexer = new Lexer(allTokens, {
  positionTracking: "full",
  ensureOptimizations: false,
});
