/**
 * Run the same Nomos program against three scenarios to show the language
 * reasoning correctly: valid / defeated / base-rule-failed.
 */

import { readFileSync } from "node:fs";
import { parse, check, evaluate, envFromJson } from "../dist/index.js";

const src = readFileSync(
  new URL("./fixtures/non_compete_fr.nomos", import.meta.url),
  "utf8",
);
const parsed = parse(src);
if (parsed.parseErrors.length) {
  console.error("parse failed");
  process.exit(1);
}
const program = parsed.ast;
check(program); // ignore warnings

const scenarios = [
  ["Employee, fair terms", "non_compete_fr.input.json"],
  ["Consumer role → defeater fires", "non_compete_fr_consumer.input.json"],
  [
    "Employee, underpaid (12%) → base rule fails",
    "non_compete_fr_lowcomp.input.json",
  ],
];

const hr = (s) => `\n\x1b[1m${s}\x1b[0m\n${"━".repeat(Math.max(40, s.length))}`;

for (const [label, file] of scenarios) {
  const inputs = JSON.parse(
    readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8"),
  );
  const query = program.declarations.find((d) => d.kind === "QueryDecl");
  const env = envFromJson(inputs, query.asOf);
  const r = evaluate(program, query, env);

  console.log(hr(label));
  console.log(
    `  verdict      ${r.value.value ? "✓ ENFORCEABLE" : "✗ NOT ENFORCEABLE"}`,
  );
  console.log(`  winning      ${r.winningRule ?? "— (no rule fired)"}`);
  if (r.defeatedRules.length) {
    console.log(`  defeated     ${r.defeatedRules.join(", ")}`);
  }
  console.log(`  asOf         ${r.asOf}`);
  console.log(`  clauses:`);
  for (const t of r.traces) {
    if (t.skippedReason) {
      console.log(`    ⊘ ${t.rule}  (${t.skippedReason})`);
      continue;
    }
    console.log(`    ${t.satisfied ? "✓" : "✗"} ${t.rule}`);
    for (const req of t.requirements) {
      console.log(
        `        ${req.satisfied ? "✓" : "✗"} ${req.clause}  → ${fmt(req.value)}`,
      );
    }
  }
}
console.log();

function fmt(v) {
  if (v.kind === "bool") return v.value ? "true" : "false";
  if (v.kind === "number") return v.value;
  if (v.kind === "null") return "null";
  return JSON.stringify(v.value ?? v);
}
