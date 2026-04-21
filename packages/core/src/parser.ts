/**
 * Nomos parser.
 *
 * Chevrotain CST parser + visitor that lowers the CST to the typed AST
 * defined in `ast.ts`. Design principles:
 *
 * - Rule modifiers (`@jurisdiction`, `from`, `priority`, `defeats`, `when`)
 *   may appear in any order — UX matters more than grammar purity.
 * - `requires` and `authority:` are separate statements inside the body
 *   (Style A from the grammar decision).
 * - Expressions use standard precedence: `||`/`∨` < `&&`/`∧` < comparisons
 *   < postfix (member/call/index) < primary.
 * - The parser never throws on syntax errors — we collect them and the
 *   caller decides what to do. This keeps the LSP happy later.
 */

import { CstParser, type IToken, type CstNode } from "chevrotain";
import {
  allTokens,
  And,
  As,
  At,
  Authority,
  Bang,
  BlockComment,
  Colon,
  Comma,
  DateLiteral,
  Defeats,
  Dot,
  DoubleEquals,
  NotEquals,
  Equals,
  Extract,
  Fact,
  False,
  From,
  GreaterEq,
  Human,
  Identifier,
  If,
  Is,
  LAngle,
  LBrace,
  LBracket,
  LParen,
  LessEq,
  LineComment,
  Llm,
  NumberLiteral,
  Not,
  Of,
  Or,
  Pipe,
  Predicate,
  Priority,
  Query,
  RAngle,
  RBrace,
  RBracket,
  RParen,
  Requires,
  Rule,
  StringLiteral,
  True,
  Type,
  Using,
  VerifiedBy,
  WhiteSpace,
  When,
  nomosLexer,
} from "./tokens.js";
import type {
  AuthorityRef,
  BinaryExpr,
  BoolLit,
  CallExpr,
  DateLit,
  Declaration,
  Expression,
  ExtractExpr,
  FactDecl,
  GenericType,
  IdentExpr,
  IndexExpr,
  IsExpr,
  LlmCall,
  MemberExpr,
  NamedType,
  NumberLit,
  Program,
  QueryDecl,
  RuleDecl,
  Span,
  StringLit,
  TypeDecl,
  TypeField,
  TypeRef,
  UnaryExpr,
  UnionType,
  DurationLit,
  PredicateDecl,
} from "./ast.js";

// ─── Parser (CST phase) ────────────────────────────────────────────────────

class NomosCstParser extends CstParser {
  constructor() {
    super(allTokens, {
      recoveryEnabled: false,
      // CST node locations let the postfix visitor pair args/indices to
      // their enclosing `(` / `[` by source offset.
      nodeLocationTracking: "full",
    });
    this.performSelfAnalysis();
  }

  public program = this.RULE("program", () => {
    this.MANY(() => this.SUBRULE(this.declaration));
  });

  private declaration = this.RULE("declaration", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.typeDecl) },
      { ALT: () => this.SUBRULE(this.ruleDecl) },
      { ALT: () => this.SUBRULE(this.factDecl) },
      { ALT: () => this.SUBRULE(this.queryDecl) },
      { ALT: () => this.SUBRULE(this.predicateDecl) },
    ]);
  });

  // ─── Predicate ──────────────────────────────────────────────────────────
  // predicate reasonable(g: Geography) = g.reasonable && g.region != "world"
  private predicateDecl = this.RULE("predicateDecl", () => {
    this.CONSUME(Predicate);
    this.CONSUME(Identifier); // predicate name
    this.CONSUME(LParen);
    this.CONSUME2(Identifier); // param name
    this.OPTION(() => {
      this.CONSUME(Colon);
      this.SUBRULE(this.typeRef);
    });
    this.CONSUME(RParen);
    this.CONSUME(Equals);
    this.SUBRULE(this.expression);
  });

  // ─── Types ──────────────────────────────────────────────────────────────
  private typeDecl = this.RULE("typeDecl", () => {
    this.CONSUME(Type);
    this.CONSUME(Identifier);
    this.CONSUME(LBrace);
    this.MANY(() => this.SUBRULE(this.typeField));
    this.CONSUME(RBrace);
  });

  private typeField = this.RULE("typeField", () => {
    this.CONSUME(Identifier);
    this.CONSUME(Colon);
    this.SUBRULE(this.typeRef);
  });

  private typeRef = this.RULE("typeRef", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.unionType) },
      {
        GATE: () => this.isGenericAhead(),
        ALT: () => this.SUBRULE(this.genericType),
      },
      { ALT: () => this.SUBRULE(this.namedType) },
    ]);
  });

  private unionType = this.RULE("unionType", () => {
    this.CONSUME(StringLiteral);
    this.AT_LEAST_ONE(() => {
      this.CONSUME(Pipe);
      this.CONSUME2(StringLiteral);
    });
  });

  private genericType = this.RULE("genericType", () => {
    this.CONSUME(Identifier);
    this.CONSUME(LAngle);
    this.SUBRULE(this.typeRef);
    this.MANY(() => {
      this.CONSUME(Comma);
      this.SUBRULE2(this.typeRef);
    });
    this.CONSUME(RAngle);
  });

  private namedType = this.RULE("namedType", () => {
    this.CONSUME(Identifier);
  });

  // ─── Rules ──────────────────────────────────────────────────────────────
  private ruleDecl = this.RULE("ruleDecl", () => {
    this.CONSUME(Rule);
    this.CONSUME(Identifier);
    this.MANY(() => this.SUBRULE(this.ruleModifier));
    this.CONSUME(LBrace);
    this.MANY2(() => this.SUBRULE(this.ruleBodyStmt));
    this.CONSUME(RBrace);
  });

  private ruleModifier = this.RULE("ruleModifier", () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(At);
          this.CONSUME(Identifier);
        },
      },
      {
        ALT: () => {
          this.CONSUME(From);
          this.CONSUME(DateLiteral);
        },
      },
      {
        ALT: () => {
          this.CONSUME(Priority);
          this.CONSUME(NumberLiteral);
        },
      },
      {
        ALT: () => {
          this.CONSUME(Defeats);
          this.CONSUME2(Identifier);
        },
      },
      {
        ALT: () => {
          this.CONSUME(When);
          this.SUBRULE(this.expression);
        },
      },
    ]);
  });

  private ruleBodyStmt = this.RULE("ruleBodyStmt", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.requiresClause) },
      { ALT: () => this.SUBRULE(this.authorityClause) },
    ]);
  });

  private requiresClause = this.RULE("requiresClause", () => {
    this.CONSUME(Requires);
    this.SUBRULE(this.expression);
  });

  private authorityClause = this.RULE("authorityClause", () => {
    this.CONSUME(Authority);
    this.CONSUME(Colon);
    this.SUBRULE(this.expression);
  });

  // ─── Facts ──────────────────────────────────────────────────────────────
  private factDecl = this.RULE("factDecl", () => {
    this.CONSUME(Fact);
    this.CONSUME(Identifier);
    this.OPTION(() => {
      this.CONSUME(Colon);
      this.SUBRULE(this.typeRef);
    });
    this.CONSUME(Equals);
    this.SUBRULE(this.expression);
  });

  // ─── Queries ────────────────────────────────────────────────────────────
  private queryDecl = this.RULE("queryDecl", () => {
    this.CONSUME(Query);
    this.SUBRULE(this.expression);
    this.OPTION(() => {
      this.CONSUME(As);
      this.CONSUME(Of);
      this.CONSUME(DateLiteral);
    });
  });

  // ─── Expressions ────────────────────────────────────────────────────────
  private expression = this.RULE("expression", () => {
    this.SUBRULE(this.logicalOr);
  });

  private logicalOr = this.RULE("logicalOr", () => {
    this.SUBRULE(this.logicalAnd);
    this.MANY(() => {
      this.CONSUME(Or);
      this.SUBRULE2(this.logicalAnd);
    });
  });

  private logicalAnd = this.RULE("logicalAnd", () => {
    this.SUBRULE(this.comparison);
    this.MANY(() => {
      this.CONSUME(And);
      this.SUBRULE2(this.comparison);
    });
  });

  private comparison = this.RULE("comparison", () => {
    this.SUBRULE(this.unary);
    this.OPTION(() =>
      this.OR([
        {
          ALT: () => {
            this.CONSUME(DoubleEquals);
            this.SUBRULE2(this.unary);
          },
        },
        {
          ALT: () => {
            this.CONSUME(NotEquals);
            this.SUBRULE7(this.unary);
          },
        },
        {
          ALT: () => {
            this.CONSUME(LessEq);
            this.SUBRULE3(this.unary);
          },
        },
        {
          ALT: () => {
            this.CONSUME(GreaterEq);
            this.SUBRULE4(this.unary);
          },
        },
        {
          ALT: () => {
            this.CONSUME(LAngle);
            this.SUBRULE5(this.unary);
          },
        },
        {
          ALT: () => {
            this.CONSUME(RAngle);
            this.SUBRULE6(this.unary);
          },
        },
        {
          // `x is reasonable` — RHS is a bare identifier predicate
          ALT: () => {
            this.CONSUME(Is);
            this.CONSUME(Identifier);
          },
        },
      ]),
    );
  });

  /** Unary prefix — `not x`, `!x`. Binds tighter than comparison. */
  private unary = this.RULE("unary", () => {
    this.OR([
      {
        ALT: () => {
          this.CONSUME(Bang);
          this.SUBRULE(this.unary);
        },
      },
      {
        ALT: () => {
          this.CONSUME(Not);
          this.SUBRULE2(this.unary);
        },
      },
      { ALT: () => this.SUBRULE(this.postfix) },
    ]);
  });

  private postfix = this.RULE("postfix", () => {
    this.SUBRULE(this.primary);
    this.MANY(() =>
      this.OR([
        {
          ALT: () => {
            this.CONSUME(Dot);
            this.CONSUME(Identifier);
          },
        },
        {
          ALT: () => {
            this.CONSUME(LParen);
            this.OPTION(() => {
              this.SUBRULE(this.argument);
              this.MANY2(() => {
                this.CONSUME(Comma);
                this.SUBRULE2(this.argument);
              });
            });
            this.CONSUME(RParen);
          },
        },
        {
          ALT: () => {
            this.CONSUME(LBracket);
            this.SUBRULE(this.expression);
            this.CONSUME(RBracket);
          },
        },
      ]),
    );
  });

  private argument = this.RULE("argument", () => {
    // Optional named arg: `section: "non-compete"`
    this.OPTION({
      GATE: () => this.isNamedArgAhead(),
      DEF: () => {
        this.CONSUME(Identifier);
        this.CONSUME(Colon);
      },
    });
    this.SUBRULE(this.expression);
  });

  private primary = this.RULE("primary", () => {
    this.OR([
      { ALT: () => this.SUBRULE(this.extractExpr) },
      { ALT: () => this.CONSUME(NumberLiteral) },
      { ALT: () => this.CONSUME(StringLiteral) },
      { ALT: () => this.CONSUME(DateLiteral) },
      { ALT: () => this.CONSUME(True) },
      { ALT: () => this.CONSUME(False) },
      { ALT: () => this.CONSUME(Identifier) },
      {
        ALT: () => {
          this.CONSUME(LParen);
          this.SUBRULE(this.expression);
          this.CONSUME(RParen);
        },
      },
    ]);
  });

  private extractExpr = this.RULE("extractExpr", () => {
    this.CONSUME(Extract);
    this.CONSUME(LAngle);
    this.SUBRULE(this.typeRef);
    this.CONSUME(RAngle);
    this.CONSUME(LParen);
    this.SUBRULE(this.argument);
    this.MANY(() => {
      this.CONSUME(Comma);
      this.SUBRULE2(this.argument);
    });
    this.CONSUME(RParen);
    this.OPTION(() => {
      this.CONSUME(Using);
      this.SUBRULE(this.llmCall);
    });
    this.OPTION2(() => {
      this.CONSUME(VerifiedBy);
      this.CONSUME(Human);
      this.OPTION3(() => {
        this.CONSUME(If);
        this.CONSUME(Identifier); // "confidence"
        this.OR([
          { ALT: () => this.CONSUME(LessEq) },
          { ALT: () => this.CONSUME2(LAngle) },
        ]);
        this.CONSUME(NumberLiteral);
      });
    });
  });

  private llmCall = this.RULE("llmCall", () => {
    this.CONSUME(Llm);
    this.CONSUME(LParen);
    this.CONSUME(StringLiteral);
    this.CONSUME(RParen);
  });

  // ─── Lookahead gates ────────────────────────────────────────────────────

  /** Ident followed by `<` and (eventually) `>` without a statement boundary. */
  private isGenericAhead(): boolean {
    const t0 = this.LA(1);
    const t1 = this.LA(2);
    return t0.tokenType === Identifier && t1.tokenType === LAngle;
  }

  /** Ident followed by `:` (and not `::`) — named argument. */
  private isNamedArgAhead(): boolean {
    const t0 = this.LA(1);
    const t1 = this.LA(2);
    return t0.tokenType === Identifier && t1.tokenType === Colon;
  }
}

const parserInstance = new NomosCstParser();

// ─── CST → AST visitor ────────────────────────────────────────────────────
//
// Chevrotain's CST visitor is class-based; we use a functional shape for
// readability. Each `visit*` function takes a CstNode and returns an AST
// node. Spans are derived from the surrounding tokens.

function spanOf(node: CstNode | IToken | undefined, fallback?: IToken): Span {
  const t: IToken | undefined = isToken(node)
    ? node
    : node
      ? firstTokenOf(node)
      : fallback;
  if (!t) {
    return {
      startLine: 0,
      startColumn: 0,
      endLine: 0,
      endColumn: 0,
      startOffset: 0,
      endOffset: 0,
    };
  }
  return {
    startLine: t.startLine ?? 0,
    startColumn: t.startColumn ?? 0,
    endLine: t.endLine ?? 0,
    endColumn: t.endColumn ?? 0,
    startOffset: t.startOffset,
    endOffset: t.endOffset ?? t.startOffset,
  };
}

function isToken(x: unknown): x is IToken {
  return !!x && typeof x === "object" && "image" in (x as object);
}

function firstTokenOf(node: CstNode): IToken | undefined {
  for (const key of Object.keys(node.children)) {
    const arr = node.children[key];
    if (!arr || arr.length === 0) continue;
    const first = arr[0];
    if (!first) continue;
    if (isToken(first)) return first;
    return firstTokenOf(first as CstNode);
  }
  return undefined;
}

function tokOf(node: CstNode, key: string, idx = 0): IToken {
  const arr = node.children[key];
  if (!arr || !arr[idx]) {
    throw new Error(`missing token ${key}[${idx}] in ${node.name}`);
  }
  return arr[idx] as IToken;
}

function optTokOf(node: CstNode, key: string, idx = 0): IToken | undefined {
  const arr = node.children[key];
  return arr && arr[idx] ? (arr[idx] as IToken) : undefined;
}

function subOf(node: CstNode, key: string, idx = 0): CstNode | undefined {
  const arr = node.children[key];
  return arr && arr[idx] ? (arr[idx] as CstNode) : undefined;
}

function allSubsOf(node: CstNode, key: string): CstNode[] {
  return (node.children[key] ?? []) as CstNode[];
}

function unquote(s: string): string {
  return s.slice(1, -1).replace(/\\(.)/g, "$1");
}

// ─── Visitors ──────────────────────────────────────────────────────────────

function visitProgram(cst: CstNode): Program {
  const declarations = allSubsOf(cst, "declaration").map(visitDeclaration);
  return {
    kind: "Program",
    span: spanOf(cst),
    declarations,
  };
}

function visitDeclaration(cst: CstNode): Declaration {
  const typeDecl = subOf(cst, "typeDecl");
  if (typeDecl) return visitTypeDecl(typeDecl);
  const ruleDecl = subOf(cst, "ruleDecl");
  if (ruleDecl) return visitRuleDecl(ruleDecl);
  const factDecl = subOf(cst, "factDecl");
  if (factDecl) return visitFactDecl(factDecl);
  const queryDecl = subOf(cst, "queryDecl");
  if (queryDecl) return visitQueryDecl(queryDecl);
  const predicateDecl = subOf(cst, "predicateDecl");
  if (predicateDecl) return visitPredicateDecl(predicateDecl);
  throw new Error("empty declaration");
}

function visitPredicateDecl(cst: CstNode): PredicateDecl {
  const idents = (cst.children["Identifier"] ?? []) as IToken[];
  const name = idents[0]?.image ?? "<anon>";
  const param = idents[1]?.image ?? "<anon>";
  const paramType = subOf(cst, "typeRef")
    ? visitTypeRef(subOf(cst, "typeRef")!)
    : null;
  const body = visitExpression(subOf(cst, "expression")!);
  return {
    kind: "PredicateDecl",
    span: spanOf(cst),
    name,
    param,
    paramType,
    body,
  };
}

function visitTypeDecl(cst: CstNode): TypeDecl {
  const nameTok = tokOf(cst, "Identifier");
  const fields = allSubsOf(cst, "typeField").map(visitTypeField);
  return {
    kind: "TypeDecl",
    span: spanOf(cst),
    name: nameTok.image,
    fields,
  };
}

function visitTypeField(cst: CstNode): TypeField {
  const nameTok = tokOf(cst, "Identifier");
  const type = visitTypeRef(subOf(cst, "typeRef")!);
  return {
    kind: "TypeField",
    span: spanOf(cst),
    name: nameTok.image,
    type,
  };
}

function visitTypeRef(cst: CstNode): TypeRef {
  const u = subOf(cst, "unionType");
  if (u) return visitUnionType(u);
  const g = subOf(cst, "genericType");
  if (g) return visitGenericType(g);
  const n = subOf(cst, "namedType");
  if (n) return visitNamedType(n);
  throw new Error("empty typeRef");
}

function visitUnionType(cst: CstNode): UnionType {
  const strs = (cst.children["StringLiteral"] ?? []) as IToken[];
  return {
    kind: "UnionType",
    span: spanOf(cst),
    variants: strs.map((t) => unquote(t.image)),
  };
}

function visitGenericType(cst: CstNode): GenericType {
  const base = tokOf(cst, "Identifier").image;
  const args = allSubsOf(cst, "typeRef").map(visitTypeRef);
  return {
    kind: "GenericType",
    span: spanOf(cst),
    base,
    args,
  };
}

function visitNamedType(cst: CstNode): NamedType {
  return {
    kind: "NamedType",
    span: spanOf(cst),
    name: tokOf(cst, "Identifier").image,
  };
}

function visitRuleDecl(cst: CstNode): RuleDecl {
  const idents = (cst.children["Identifier"] ?? []) as IToken[];
  const name = idents[0]?.image ?? "<anon>";

  let jurisdiction: string | null = null;
  let from: string | null = null;
  let priority = 0;
  const defeats: string[] = [];
  let whenExpr: Expression | null = null;

  for (const mod of allSubsOf(cst, "ruleModifier")) {
    if (mod.children["At"]) {
      jurisdiction = (mod.children["Identifier"]![0] as IToken).image;
    } else if (mod.children["From"]) {
      from = (mod.children["DateLiteral"]![0] as IToken).image;
    } else if (mod.children["Priority"]) {
      priority = Number((mod.children["NumberLiteral"]![0] as IToken).image);
    } else if (mod.children["Defeats"]) {
      defeats.push((mod.children["Identifier"]![0] as IToken).image);
    } else if (mod.children["When"]) {
      whenExpr = visitExpression(mod.children["expression"]![0] as CstNode);
    }
  }

  const requires: Expression[] = [];
  const authorities: AuthorityRef[] = [];
  for (const stmt of allSubsOf(cst, "ruleBodyStmt")) {
    const req = subOf(stmt, "requiresClause");
    if (req) {
      requires.push(visitExpression(subOf(req, "expression")!));
      continue;
    }
    const auth = subOf(stmt, "authorityClause");
    if (auth) {
      const expr = subOf(auth, "expression")!;
      authorities.push(buildAuthorityRef(visitExpression(expr), spanOf(auth)));
    }
  }

  return {
    kind: "RuleDecl",
    span: spanOf(cst),
    name,
    jurisdiction,
    from,
    priority,
    defeats,
    when: whenExpr,
    requires,
    authorities,
  };
}

function visitFactDecl(cst: CstNode): FactDecl {
  const name = tokOf(cst, "Identifier").image;
  const typeAnnotation = subOf(cst, "typeRef")
    ? visitTypeRef(subOf(cst, "typeRef")!)
    : null;
  const value = visitExpression(subOf(cst, "expression")!);
  return {
    kind: "FactDecl",
    span: spanOf(cst),
    name,
    typeAnnotation,
    value,
  };
}

function visitQueryDecl(cst: CstNode): QueryDecl {
  const expression = visitExpression(subOf(cst, "expression")!);
  const asOfTok = optTokOf(cst, "DateLiteral");
  return {
    kind: "QueryDecl",
    span: spanOf(cst),
    expression,
    asOf: asOfTok ? asOfTok.image : null,
  };
}

// ─── Expression visitors ───────────────────────────────────────────────────

function visitExpression(cst: CstNode): Expression {
  return visitLogicalOr(subOf(cst, "logicalOr")!);
}

function visitLogicalOr(cst: CstNode): Expression {
  const ands = allSubsOf(cst, "logicalAnd").map(visitLogicalAnd);
  return ands.reduce((left, right, i) => {
    if (i === 0) return left;
    const bin: BinaryExpr = {
      kind: "BinaryExpr",
      span: spanOf(cst),
      op: "||",
      left,
      right,
    };
    return bin;
  });
}

function visitLogicalAnd(cst: CstNode): Expression {
  const comps = allSubsOf(cst, "comparison").map(visitComparison);
  return comps.reduce((left, right, i) => {
    if (i === 0) return left;
    const bin: BinaryExpr = {
      kind: "BinaryExpr",
      span: spanOf(cst),
      op: "&&",
      left,
      right,
    };
    return bin;
  });
}

function visitComparison(cst: CstNode): Expression {
  const [leftCst, rightCst] = allSubsOf(cst, "unary");
  const left = visitUnary(leftCst!);

  // `is` check comes *before* early return — `x is foo` has no right-unary.
  if (cst.children["Is"]) {
    const predTok = (cst.children["Identifier"]![0] as IToken).image;
    const isExpr: IsExpr = {
      kind: "IsExpr",
      span: spanOf(cst),
      subject: left,
      predicate: predTok,
    };
    return isExpr;
  }

  if (!rightCst) return left;
  const right = visitUnary(rightCst);
  let op: BinaryExpr["op"] = "==";
  if (cst.children["DoubleEquals"]) op = "==";
  else if (cst.children["NotEquals"]) op = "!=";
  else if (cst.children["LessEq"]) op = "<=";
  else if (cst.children["GreaterEq"]) op = ">=";
  else if (cst.children["LAngle"]) op = "<";
  else if (cst.children["RAngle"]) op = ">";

  return {
    kind: "BinaryExpr",
    span: spanOf(cst),
    op,
    left,
    right,
  };
}

/**
 * Visit a `unary` CST node. `!x` and `not x` both fold into UnaryExpr{op:"!"}.
 * When no prefix operator is present, delegate to visitPostfix.
 */
function visitUnary(cst: CstNode): Expression {
  const nested = subOf(cst, "unary");
  if (nested) {
    const operand = visitUnary(nested);
    const unaryExpr: UnaryExpr = {
      kind: "UnaryExpr",
      span: spanOf(cst),
      op: "!",
      operand,
    };
    return unaryExpr;
  }
  const postfix = subOf(cst, "postfix");
  if (postfix) return visitPostfix(postfix);
  throw new Error("empty unary");
}

/**
 * Duration units recognized as sugar on a number literal.
 * Stored internally as months (Float).
 */
const DURATION_UNITS: Record<
  string,
  { unit: DurationLit["unit"]; monthsPerUnit: number }
> = {
  day: { unit: "day", monthsPerUnit: 1 / 30 },
  days: { unit: "day", monthsPerUnit: 1 / 30 },
  week: { unit: "week", monthsPerUnit: 7 / 30 },
  weeks: { unit: "week", monthsPerUnit: 7 / 30 },
  month: { unit: "month", monthsPerUnit: 1 },
  months: { unit: "month", monthsPerUnit: 1 },
  year: { unit: "year", monthsPerUnit: 12 },
  years: { unit: "year", monthsPerUnit: 12 },
};

function visitPostfix(cst: CstNode): Expression {
  let expr: Expression = visitPrimary(subOf(cst, "primary")!);

  // Shortcut: if we see `<NumberLit>.<unit>` with nothing else trailing,
  // fold into a DurationLit. `18.months`, `2.years`, etc.
  if (expr.kind === "NumberLit") {
    const dots = (cst.children["Dot"] ?? []) as IToken[];
    const idents = (cst.children["Identifier"] ?? []) as IToken[];
    const lparens = cst.children["LParen"] ?? [];
    const lbrackets = cst.children["LBracket"] ?? [];
    if (
      dots.length === 1 &&
      idents.length === 1 &&
      lparens.length === 0 &&
      lbrackets.length === 0 &&
      DURATION_UNITS[idents[0]!.image]
    ) {
      const info = DURATION_UNITS[idents[0]!.image]!;
      const lit: DurationLit = {
        kind: "DurationLit",
        span: spanOf(cst),
        rawValue: expr.value,
        unit: info.unit,
        months: expr.value * info.monthsPerUnit,
      };
      return lit;
    }
  }

  // Walk the postfix chain in token order.
  // Chevrotain keeps children keyed by construct; we need source order —
  // easiest is to re-walk each child group by startOffset.
  type Postfix =
    | { kind: "member"; name: string; span: Span }
    | { kind: "call"; args: CstNode[]; span: Span }
    | { kind: "index"; index: CstNode; span: Span };

  const ops: Postfix[] = [];
  const dots = (cst.children["Dot"] ?? []) as IToken[];
  const idents = (cst.children["Identifier"] ?? []) as IToken[];
  const lparens = (cst.children["LParen"] ?? []) as IToken[];
  const rparens = (cst.children["RParen"] ?? []) as IToken[];
  const lbrackets = (cst.children["LBracket"] ?? []) as IToken[];
  const rbrackets = (cst.children["RBracket"] ?? []) as IToken[];
  const args = (cst.children["argument"] ?? []) as CstNode[];
  const exprChildren = (cst.children["expression"] ?? []) as CstNode[];

  // Walk dots + idents as member accesses, pairing by position.
  for (let i = 0; i < dots.length; i++) {
    ops.push({
      kind: "member",
      name: idents[i]!.image,
      span: spanOf(idents[i]),
    });
  }

  // Pair each LParen with its args up to the matching RParen by offset.
  let argCursor = 0;
  for (let i = 0; i < lparens.length; i++) {
    const lp = lparens[i]!;
    const rp = rparens[i]!;
    const myArgs: CstNode[] = [];
    while (
      argCursor < args.length &&
      args[argCursor]!.location &&
      args[argCursor]!.location!.startOffset! > lp.startOffset &&
      args[argCursor]!.location!.startOffset! < rp.startOffset
    ) {
      myArgs.push(args[argCursor]!);
      argCursor++;
    }
    ops.push({ kind: "call", args: myArgs, span: spanOf(lp) });
  }

  // Pair index expressions to LBracket positions.
  let exprCursor = 0;
  for (let i = 0; i < lbrackets.length; i++) {
    const lb = lbrackets[i]!;
    const rb = rbrackets[i]!;
    while (
      exprCursor < exprChildren.length &&
      exprChildren[exprCursor]!.location &&
      exprChildren[exprCursor]!.location!.startOffset! > lb.startOffset &&
      exprChildren[exprCursor]!.location!.startOffset! < rb.startOffset
    ) {
      ops.push({
        kind: "index",
        index: exprChildren[exprCursor]!,
        span: spanOf(lb),
      });
      exprCursor++;
    }
  }

  // Sort ops by source order so member.call[index].call is applied correctly.
  ops.sort((a, b) => a.span.startOffset - b.span.startOffset);

  for (const op of ops) {
    if (op.kind === "member") {
      const m: MemberExpr = {
        kind: "MemberExpr",
        span: op.span,
        object: expr,
        property: op.name,
      };
      expr = m;
    } else if (op.kind === "call") {
      const c: CallExpr = {
        kind: "CallExpr",
        span: op.span,
        callee: expr,
        args: op.args.map(visitArgument),
      };
      expr = c;
    } else {
      const i: IndexExpr = {
        kind: "IndexExpr",
        span: op.span,
        object: expr,
        index: visitExpression(op.index),
      };
      expr = i;
    }
  }

  return expr;
}

function visitArgument(cst: CstNode): Expression {
  // We intentionally drop argument *names* at the AST level for positional
  // calls. ExtractExpr handles named args specifically (see below).
  return visitExpression(subOf(cst, "expression")!);
}

function visitPrimary(cst: CstNode): Expression {
  const ex = subOf(cst, "extractExpr");
  if (ex) return visitExtractExpr(ex);

  const numTok = optTokOf(cst, "NumberLiteral");
  if (numTok) {
    const lit: NumberLit = {
      kind: "NumberLit",
      span: spanOf(numTok),
      value: Number(numTok.image),
    };
    return lit;
  }

  const strTok = optTokOf(cst, "StringLiteral");
  if (strTok) {
    const lit: StringLit = {
      kind: "StringLit",
      span: spanOf(strTok),
      value: unquote(strTok.image),
    };
    return lit;
  }

  const dateTok = optTokOf(cst, "DateLiteral");
  if (dateTok) {
    const lit: DateLit = {
      kind: "DateLit",
      span: spanOf(dateTok),
      value: dateTok.image,
    };
    return lit;
  }

  if (cst.children["True"]) {
    const lit: BoolLit = { kind: "BoolLit", span: spanOf(cst), value: true };
    return lit;
  }
  if (cst.children["False"]) {
    const lit: BoolLit = { kind: "BoolLit", span: spanOf(cst), value: false };
    return lit;
  }

  const identTok = optTokOf(cst, "Identifier");
  if (identTok) {
    const id: IdentExpr = {
      kind: "IdentExpr",
      span: spanOf(identTok),
      name: identTok.image,
    };
    return id;
  }

  // parenthesized expression
  const inner = subOf(cst, "expression");
  if (inner) return visitExpression(inner);

  throw new Error("empty primary");
}

function visitExtractExpr(cst: CstNode): ExtractExpr {
  const targetType = visitTypeRef(subOf(cst, "typeRef")!);
  const args = allSubsOf(cst, "argument");
  const source = visitExpression(subOf(args[0]!, "expression")!);

  const kwargs: { name: string; value: Expression }[] = [];
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    const idTok = optTokOf(arg, "Identifier");
    const name = idTok ? idTok.image : `arg${i}`;
    kwargs.push({
      name,
      value: visitExpression(subOf(arg, "expression")!),
    });
  }

  const llmSub = subOf(cst, "llmCall");
  const using: LlmCall | null = llmSub
    ? {
        kind: "LlmCall",
        span: spanOf(llmSub),
        model: unquote((llmSub.children["StringLiteral"]![0] as IToken).image),
      }
    : null;

  const verifiedByHuman = !!cst.children["VerifiedBy"];
  let confidenceThreshold: number | null = null;
  if (cst.children["If"]) {
    // confidence threshold is the last NumberLiteral in this extractExpr
    const nums = (cst.children["NumberLiteral"] ?? []) as IToken[];
    if (nums.length > 0) {
      confidenceThreshold = Number(nums[nums.length - 1]!.image);
    }
  }

  return {
    kind: "ExtractExpr",
    span: spanOf(cst),
    targetType,
    source,
    kwargs,
    using,
    verifiedByHuman,
    confidenceThreshold,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Build a typed AuthorityRef from an already-visited expression AST.
 *
 * Nomos's canonical authority shapes:
 *
 *   publisher.art("L1121-1")          → article
 *   publisher.section("7.2")          → section
 *   publisher.decree("...", DATE)     → decree
 *   publisher(DATE, "00-45135")       → case
 *   publisher(anything else)          → generic
 *
 * The grammar is deliberately loose — Nomos doesn't enforce one jurisdiction's
 * citation conventions. We classify by shape, keep a stable canonical string
 * for downstream resolvers, and retain anything unexpected in `extra`.
 */
function buildAuthorityRef(expr: Expression, span: Span): AuthorityRef {
  // Case 1: publisher.method(args…) → method decides the citation kind
  if (expr.kind === "CallExpr" && expr.callee.kind === "MemberExpr") {
    const member = expr.callee;
    if (member.object.kind === "IdentExpr") {
      const source = member.object.name;
      const method = member.property;
      const args = expr.args.map(flatExprToString);
      const primary = args[0] ?? "";
      const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? null;
      let citationKind: AuthorityRef["citationKind"] = "generic";
      if (method === "art" || method === "article") citationKind = "article";
      else if (method === "section" || method === "sec")
        citationKind = "section";
      else if (method === "decree") citationKind = "decree";
      const extra = args.filter((a) => a !== primary && a !== date);
      return {
        kind: "AuthorityRef",
        span,
        source,
        citationKind,
        primary: primary.replace(/^"|"$/g, ""),
        date,
        extra,
        canonical: renderAuthority(source, method, args),
      };
    }
  }

  // Case 2: publisher(args…) — typically a case citation.
  if (expr.kind === "CallExpr" && expr.callee.kind === "IdentExpr") {
    const source = expr.callee.name;
    const args = expr.args.map(flatExprToString);
    const date = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? null;
    const primary =
      args.find((a) => /^".+"$/.test(a))?.replace(/^"|"$/g, "") ?? "";
    const extra = args.filter((a) => a !== date && !/^".+"$/.test(a));
    return {
      kind: "AuthorityRef",
      span,
      source,
      citationKind: "case",
      primary,
      date,
      extra,
      canonical: renderAuthority(source, null, args),
    };
  }

  // Fallback: keep whatever the user wrote as a generic canonical string.
  return {
    kind: "AuthorityRef",
    span,
    source: expr.kind === "IdentExpr" ? expr.name : "<expr>",
    citationKind: "generic",
    primary: flatExprToString(expr),
    date: null,
    extra: [],
    canonical: flatExprToString(expr),
  };
}

/** Render a citation into the canonical "publisher.method(args)" form. */
function renderAuthority(
  source: string,
  method: string | null,
  args: string[],
): string {
  const prefix = method ? `${source}.${method}` : source;
  return `${prefix}(${args.join(", ")})`;
}

/** Flatten a simple expression back to its source text for display. */
function flatExprToString(e: Expression): string {
  switch (e.kind) {
    case "NumberLit":
      return String(e.value);
    case "StringLit":
      return JSON.stringify(e.value);
    case "DateLit":
      return e.value;
    case "DurationLit":
      return `${e.rawValue}.${e.unit}${e.rawValue === 1 ? "" : "s"}`;
    case "BoolLit":
      return String(e.value);
    case "IdentExpr":
      return e.name;
    case "MemberExpr":
      return `${flatExprToString(e.object)}.${e.property}`;
    case "CallExpr":
      return `${flatExprToString(e.callee)}(${e.args.map(flatExprToString).join(", ")})`;
    case "IndexExpr":
      return `${flatExprToString(e.object)}[${flatExprToString(e.index)}]`;
    case "BinaryExpr":
      return `${flatExprToString(e.left)} ${e.op} ${flatExprToString(e.right)}`;
    case "IsExpr":
      return `${flatExprToString(e.subject)} is ${e.predicate}`;
    case "UnaryExpr":
      return `${e.op}${flatExprToString(e.operand)}`;
    case "ExtractExpr":
      return `extract<…>`;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface ParseResult {
  ast: Program | null;
  lexErrors: { message: string; line: number; column: number }[];
  parseErrors: { message: string; line: number; column: number }[];
}

export function parse(source: string): ParseResult {
  const lexResult = nomosLexer.tokenize(source);
  if (lexResult.errors.length > 0) {
    return {
      ast: null,
      lexErrors: lexResult.errors.map((e) => ({
        message: e.message,
        line: e.line ?? 0,
        column: e.column ?? 0,
      })),
      parseErrors: [],
    };
  }

  parserInstance.input = lexResult.tokens;
  const cst = parserInstance.program();

  if (parserInstance.errors.length > 0) {
    return {
      ast: null,
      lexErrors: [],
      parseErrors: parserInstance.errors.map((e) => ({
        message: e.message,
        line: e.token.startLine ?? 0,
        column: e.token.startColumn ?? 0,
      })),
    };
  }

  return {
    ast: visitProgram(cst),
    lexErrors: [],
    parseErrors: [],
  };
}

// Re-export token list for tests.
export { allTokens, WhiteSpace, LineComment, BlockComment };
