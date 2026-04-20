import { readFileSync } from "node:fs";
import { parse, check, evaluate, envFromJson } from "../dist/index.js";

const srcUrl = new URL("./fixtures/non_compete_fr.nomos", import.meta.url);
const jsonUrl = new URL(
  "./fixtures/non_compete_fr.input.json",
  import.meta.url,
);

const src = readFileSync(srcUrl, "utf8");
const inputs = JSON.parse(readFileSync(jsonUrl, "utf8"));

// ─── 1. Parse ─────────────────────────────────────────────────────────────
const parsed = parse(src);
if (parsed.parseErrors.length || parsed.lexErrors.length) {
  console.error("Parse failed:");
  for (const e of [...parsed.lexErrors, ...parsed.parseErrors]) {
    console.error(`  [${e.line}:${e.column}] ${e.message}`);
  }
  process.exit(1);
}
const program = parsed.ast;

// ─── 2. Check ─────────────────────────────────────────────────────────────
const checked = check(program);
const errors = checked.diagnostics.filter((d) => d.severity === "error");
const warnings = checked.diagnostics.filter((d) => d.severity === "warning");
if (errors.length) {
  console.error("Type-check errors:");
  for (const d of errors)
    console.error(`  [${d.line}:${d.column}] ${d.message}`);
  process.exit(1);
}

// ─── 3. Evaluate each query ───────────────────────────────────────────────
const queries = program.declarations.filter((d) => d.kind === "QueryDecl");
if (queries.length === 0) {
  console.error("No queries in program.");
  process.exit(1);
}

const sep = (s) => `\n${"─".repeat(60)}\n${s}\n${"─".repeat(60)}`;

for (const q of queries) {
  const env = envFromJson(
    inputs,
    q.asOf ?? new Date().toISOString().slice(0, 10),
  );
  const result = evaluate(program, q, env);

  console.log(sep("QUERY"));
  console.log(`  expression : ${renderExpr(q.expression)}`);
  console.log(`  as of      : ${result.asOf}`);

  console.log(sep("VERDICT"));
  console.log(`  value         : ${formatValue(result.value)}`);
  console.log(`  winning rule  : ${result.winningRule ?? "—"}`);
  if (result.defeatedRules.length) {
    console.log(`  defeated      : ${result.defeatedRules.join(", ")}`);
  }
  if (result.authorities.length) {
    console.log(`  authorities   :`);
    for (const a of result.authorities) console.log(`    • ${a}`);
  }

  console.log(sep("PROOF TREE"));
  for (const t of result.traces) {
    const icon = t.skippedReason ? "⊘" : t.satisfied ? "✓" : "✗";
    console.log(`  ${icon} rule: ${t.rule}`);
    if (t.skippedReason) {
      console.log(`      skipped → ${t.skippedReason}`);
      continue;
    }
    for (const r of t.requirements) {
      const ri = r.satisfied ? "  ✓" : "  ✗";
      console.log(`    ${ri} ${r.clause}   → ${formatValue(r.value)}`);
    }
  }
}

if (warnings.length) {
  console.log(sep("WARNINGS"));
  for (const d of warnings) {
    console.log(`  [${d.line}:${d.column}] ${d.message}`);
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────

function renderExpr(e) {
  if (e.kind === "IdentExpr") return e.name;
  if (e.kind === "CallExpr") return `${renderExpr(e.callee)}(…)`;
  return "<expr>";
}

function formatValue(v) {
  switch (v.kind) {
    case "bool":
      return v.value ? "TRUE" : "FALSE";
    case "number":
      return String(v.value);
    case "string":
      return JSON.stringify(v.value);
    case "date":
      return v.value;
    case "null":
      return "null";
    default:
      return JSON.stringify(v);
  }
}
