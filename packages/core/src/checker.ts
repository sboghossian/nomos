/**
 * Nomos name resolver (minimal type checker, v0).
 *
 * Walks the AST and builds a symbol table mapping identifiers to their
 * declaring nodes. Flags unresolved references as diagnostics. Does *not*
 * yet check types, temporal validity, or jurisdiction — those arrive in
 * later passes. This is the bare minimum the evaluator needs.
 *
 * The resolver is deliberately permissive: inside a rule body, any identifier
 * that isn't a local type is assumed to refer to a fact in scope (duck-typed
 * access). This mirrors Datalog: rules reach into the ambient fact world.
 */

import type {
  Declaration,
  Expression,
  FactDecl,
  Program,
  RuleDecl,
  TypeDecl,
} from "./ast.js";

export interface SymbolTable {
  types: Map<string, TypeDecl>;
  rules: Map<string, RuleDecl>;
  facts: Map<string, FactDecl>;
}

export interface Diagnostic {
  severity: "error" | "warning";
  message: string;
  line: number;
  column: number;
}

export interface CheckResult {
  symbols: SymbolTable;
  diagnostics: Diagnostic[];
}

export function check(program: Program): CheckResult {
  const symbols: SymbolTable = {
    types: new Map(),
    rules: new Map(),
    facts: new Map(),
  };
  const diagnostics: Diagnostic[] = [];

  // Pass 1: register top-level declarations.
  for (const d of program.declarations) {
    registerDecl(d, symbols, diagnostics);
  }

  // Pass 2: check rule bodies, queries, fact values for unresolved refs.
  for (const d of program.declarations) {
    if (d.kind === "RuleDecl") {
      if (d.when) checkExpression(d.when, symbols, diagnostics);
      for (const r of d.requires) checkExpression(r, symbols, diagnostics);
      for (const name of d.defeats) {
        if (!symbols.rules.has(name)) {
          diagnostics.push({
            severity: "error",
            message: `rule "${name}" referenced in "defeats" is not declared`,
            line: d.span.startLine,
            column: d.span.startColumn,
          });
        }
      }
    } else if (d.kind === "FactDecl") {
      checkExpression(d.value, symbols, diagnostics);
    } else if (d.kind === "QueryDecl") {
      checkExpression(d.expression, symbols, diagnostics);
    }
  }

  return { symbols, diagnostics };
}

function registerDecl(
  d: Declaration,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
): void {
  switch (d.kind) {
    case "TypeDecl":
      if (symbols.types.has(d.name)) {
        diagnostics.push(dup(d, "type", d.name));
      } else {
        symbols.types.set(d.name, d);
      }
      break;
    case "RuleDecl":
      if (symbols.rules.has(d.name)) {
        diagnostics.push(dup(d, "rule", d.name));
      } else {
        symbols.rules.set(d.name, d);
      }
      break;
    case "FactDecl":
      if (symbols.facts.has(d.name)) {
        diagnostics.push(dup(d, "fact", d.name));
      } else {
        symbols.facts.set(d.name, d);
      }
      break;
    case "QueryDecl":
      // queries are anonymous — nothing to register
      break;
  }
}

function dup(d: Declaration, kind: string, name: string): Diagnostic {
  return {
    severity: "error",
    message: `duplicate ${kind} "${name}"`,
    line: d.span.startLine,
    column: d.span.startColumn,
  };
}

/**
 * Walk an expression; emit a diagnostic for any free identifier that
 * isn't a known fact, rule, or type. We treat member access subjects,
 * function call callees, and `is` subjects conservatively — if the
 * root identifier is unknown, it's an error.
 */
function checkExpression(
  expr: Expression,
  symbols: SymbolTable,
  diagnostics: Diagnostic[],
): void {
  switch (expr.kind) {
    case "NumberLit":
    case "StringLit":
    case "BoolLit":
    case "DateLit":
    case "DurationLit":
      return;
    case "IdentExpr": {
      const known =
        symbols.facts.has(expr.name) ||
        symbols.rules.has(expr.name) ||
        symbols.types.has(expr.name) ||
        // Well-known implicit fact: `party` is bound per-query from `parties`.
        // Later we'll make this explicit; for v0, treat it as reserved.
        expr.name === "party" ||
        expr.name === "confidence";
      if (!known) {
        diagnostics.push({
          severity: "warning",
          message: `unresolved reference "${expr.name}" — assumed to be an ambient fact`,
          line: expr.span.startLine,
          column: expr.span.startColumn,
        });
      }
      return;
    }
    case "MemberExpr":
      checkExpression(expr.object, symbols, diagnostics);
      return;
    case "CallExpr":
      checkExpression(expr.callee, symbols, diagnostics);
      for (const a of expr.args) checkExpression(a, symbols, diagnostics);
      return;
    case "IndexExpr":
      checkExpression(expr.object, symbols, diagnostics);
      checkExpression(expr.index, symbols, diagnostics);
      return;
    case "BinaryExpr":
      checkExpression(expr.left, symbols, diagnostics);
      checkExpression(expr.right, symbols, diagnostics);
      return;
    case "UnaryExpr":
      checkExpression(expr.operand, symbols, diagnostics);
      return;
    case "IsExpr":
      checkExpression(expr.subject, symbols, diagnostics);
      return;
    case "ExtractExpr":
      checkExpression(expr.source, symbols, diagnostics);
      for (const k of expr.kwargs)
        checkExpression(k.value, symbols, diagnostics);
      return;
  }
}
