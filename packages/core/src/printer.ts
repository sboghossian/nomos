/**
 * AST pretty-printer.
 *
 * Produces a compact, human-readable tree view of a parsed Nomos program —
 * useful for debugging the parser and for the `nomos parse` CLI command.
 * Not a code formatter; formatting is a separate concern.
 */

import type {
  Declaration,
  Expression,
  Program,
  RuleDecl,
  TypeDecl,
  TypeRef,
} from "./ast.js";

export function prettyPrint(program: Program): string {
  const lines: string[] = [`Program (${program.declarations.length} decls)`];
  for (const d of program.declarations) {
    lines.push(...indent(printDecl(d)));
  }
  return lines.join("\n");
}

function printDecl(d: Declaration): string[] {
  switch (d.kind) {
    case "TypeDecl":
      return printTypeDecl(d);
    case "RuleDecl":
      return printRuleDecl(d);
    case "FactDecl":
      return [
        `Fact ${d.name}${d.typeAnnotation ? `: ${printType(d.typeAnnotation)}` : ""}`,
        ...indent([`= ${printExpr(d.value)}`]),
      ];
    case "QueryDecl":
      return [
        `Query${d.asOf ? ` (as of ${d.asOf})` : ""}`,
        ...indent([printExpr(d.expression)]),
      ];
  }
}

function printTypeDecl(d: TypeDecl): string[] {
  const out = [`Type ${d.name}`];
  for (const f of d.fields) {
    out.push(...indent([`${f.name}: ${printType(f.type)}`]));
  }
  return out;
}

function printRuleDecl(d: RuleDecl): string[] {
  const mods: string[] = [];
  if (d.jurisdiction) mods.push(`@${d.jurisdiction}`);
  if (d.from) mods.push(`from ${d.from}`);
  if (d.priority !== 0) mods.push(`priority ${d.priority}`);
  if (d.defeats.length > 0) mods.push(`defeats ${d.defeats.join(", ")}`);

  const out = [`Rule ${d.name}${mods.length ? ` [${mods.join(" · ")}]` : ""}`];
  if (d.when) {
    out.push(...indent([`when ${printExpr(d.when)}`]));
  }
  for (const r of d.requires) {
    out.push(...indent([`requires ${printExpr(r)}`]));
  }
  for (const a of d.authorities) {
    out.push(...indent([`authority: ${a.raw}`]));
  }
  return out;
}

function printType(t: TypeRef): string {
  switch (t.kind) {
    case "NamedType":
      return t.name;
    case "UnionType":
      return t.variants.map((v) => `"${v}"`).join(" | ");
    case "GenericType":
      return `${t.base}<${t.args.map(printType).join(", ")}>`;
  }
}

function printExpr(e: Expression): string {
  switch (e.kind) {
    case "NumberLit":
      return String(e.value);
    case "StringLit":
      return JSON.stringify(e.value);
    case "BoolLit":
      return String(e.value);
    case "DateLit":
      return e.value;
    case "IdentExpr":
      return e.name;
    case "MemberExpr":
      return `${printExpr(e.object)}.${e.property}`;
    case "CallExpr":
      return `${printExpr(e.callee)}(${e.args.map(printExpr).join(", ")})`;
    case "IndexExpr":
      return `${printExpr(e.object)}[${printExpr(e.index)}]`;
    case "BinaryExpr":
      return `(${printExpr(e.left)} ${e.op} ${printExpr(e.right)})`;
    case "IsExpr":
      return `${printExpr(e.subject)} is ${e.predicate}`;
    case "ExtractExpr": {
      const parts = [
        `extract<${printType(e.targetType)}>(${printExpr(e.source)}${
          e.kwargs.length
            ? ", " +
              e.kwargs.map((k) => `${k.name}: ${printExpr(k.value)}`).join(", ")
            : ""
        })`,
      ];
      if (e.using) parts.push(`using llm("${e.using.model}")`);
      if (e.verifiedByHuman) {
        parts.push("verified_by human");
        if (e.confidenceThreshold !== null) {
          parts.push(`if confidence < ${e.confidenceThreshold}`);
        }
      }
      return parts.join(" ");
    }
  }
}

function indent(lines: string[]): string[] {
  return lines.map((l) => "  " + l);
}
