/**
 * Human-readable rendering of evaluation results for the CLI.
 *
 * Goal: the `nomos run` output should look like something you'd want to
 * include in a legal brief — confident, proof-chained, quotable.
 */

import type { EvalResult, RuleTrace, Value } from "@nomos/core";
import { bold, cyan, dim, gray, green, red, yellow } from "./tty.js";

export function renderResult(r: EvalResult, queryLabel: string): string {
  const out: string[] = [];

  out.push(sectionHeader("QUERY"));
  out.push(`  ${dim("expression")}  ${queryLabel}`);
  out.push(`  ${dim("as of     ")}  ${r.asOf}`);

  out.push("");
  out.push(sectionHeader("VERDICT"));
  out.push(`  ${dim("value       ")}  ${verdictLine(r.value)}`);
  out.push(
    `  ${dim("winning rule")}  ${r.winningRule ? cyan(r.winningRule) : dim("—")}`,
  );
  if (r.defeatedRules.length) {
    out.push(`  ${dim("defeated    ")}  ${yellow(r.defeatedRules.join(", "))}`);
  }
  if (r.authorities.length) {
    out.push(`  ${dim("authorities ")}`);
    for (const a of r.authorities) out.push(`      ${a}`);
  }

  // Tiebreaker explanation — only when there was a real contest.
  if (r.tiebreaker) {
    out.push("");
    out.push(sectionHeader("TIEBREAKER"));
    out.push(`  ${dim("decided by  ")}  ${cyan(r.tiebreaker.decidedBy)}`);
    out.push(`  ${dim("summary     ")}  ${r.tiebreaker.summary}`);
    out.push(`  ${dim("candidates  ")}`);
    for (const c of r.tiebreaker.candidates) {
      out.push(
        `      ${bold(c.rule)}  ${dim("prio")} ${c.priority}  ${dim("spec")} ${c.specificity}  ${dim("from")} ${c.from ?? "—"}  ${dim("decl#")} ${c.declIndex}`,
      );
    }
  }

  out.push("");
  out.push(sectionHeader("PROOF"));
  for (const t of r.traces) out.push(...renderTrace(t));

  return out.join("\n");
}

function renderTrace(t: RuleTrace): string[] {
  const lines: string[] = [];
  if (t.skippedReason) {
    lines.push(
      `  ${gray("⊘")} ${dim(t.rule)}  ${gray("(" + t.skippedReason + ")")}`,
    );
    return lines;
  }
  const icon = t.satisfied ? green("✓") : red("✗");
  lines.push(`  ${icon} ${bold(t.rule)}`);
  for (const r of t.requirements) {
    const ri = r.satisfied ? green("✓") : red("✗");
    const val = gray("→ " + formatValue(r.value));
    lines.push(`      ${ri} ${r.clause}  ${val}`);

    // For failing requirements, surface the actual operand values so the
    // user can see *why* it failed without re-running.
    if (!r.satisfied && r.operands && r.operands.length > 0) {
      for (const op of r.operands) {
        lines.push(
          `          ${dim("·")} ${dim(op.expr)} ${dim("=")} ${formatValue(op.value)}`,
        );
      }
    }
  }
  return lines;
}

export function renderDiagnostics(
  diags: { severity: string; message: string; line: number; column: number }[],
  label: string,
): string {
  if (!diags.length) return "";
  const out: string[] = [];
  out.push(sectionHeader(label));
  for (const d of diags) {
    const sev =
      d.severity === "error"
        ? red("error")
        : d.severity === "warning"
          ? yellow("warn ")
          : dim(d.severity);
    out.push(`  ${sev} ${dim(`[${d.line}:${d.column}]`)} ${d.message}`);
  }
  return out.join("\n");
}

function sectionHeader(s: string): string {
  return (
    dim("─── ") +
    bold(s) +
    dim(" " + "─".repeat(Math.max(0, 60 - s.length - 4)))
  );
}

function verdictLine(v: Value): string {
  if (v.kind === "bool") {
    return v.value ? green(bold("TRUE")) : red(bold("FALSE"));
  }
  return formatValue(v);
}

function formatValue(v: Value): string {
  switch (v.kind) {
    case "bool":
      return v.value ? "true" : "false";
    case "number":
      return String(v.value);
    case "string":
      return JSON.stringify(v.value);
    case "date":
      return v.value;
    case "null":
      return "null";
    case "list":
      return `[${v.value.length} items]`;
    case "object":
      return "{…}";
  }
}
