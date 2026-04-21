/**
 * CUAD benchmark harness for Nomos.
 *
 * Picks a small, honest sample from the CUAD dataset (Atticus Project,
 * 20,910 Q/A pairs across 510 commercial contracts) and measures how
 * well Nomos's `extract<T>` primitive retrieves the correct span.
 *
 * Scoring:
 *   exact_match  — extracted string == any ground-truth answer
 *   contains     — any ground-truth answer substring(extracted)
 *                  OR extracted substring(ground-truth)
 *   f1_token     — token-level F1 between extracted and best ground-truth
 *   confidence   — self-rated confidence from the model
 *
 * Usage:
 *   OPENROUTER_API_KEY=... node bench/cuad/harness.mjs \
 *     --cuad /tmp/cuad.json \
 *     --samples 10 \
 *     --categories "Document Name,Effective Date,Parties,Governing Law" \
 *     --model claude-sonnet-4-5
 *
 * Writes results/<timestamp>.json and prints a summary table.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parse as parseNomos,
  envFromJson,
} from "../../packages/core/dist/index.js";
import { resolveFacts } from "../../packages/llm/dist/index.js";

// ─── args ──────────────────────────────────────────────────────────────────

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}

const CUAD_PATH = arg("cuad", "/tmp/cuad.json");
const SAMPLES = Number(arg("samples", "10"));
// --models takes precedence; --model is kept for single-model compat.
const MODELS = arg("models", "")
  ? arg("models")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : [arg("model", "claude-sonnet-4-5")];
const CATEGORIES = (
  arg(
    "categories",
    "Document Name,Effective Date,Parties,Governing Law,Agreement Date",
  ) ?? ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const API_KEY = process.env["OPENROUTER_API_KEY"];
if (!API_KEY) {
  console.error("error: OPENROUTER_API_KEY not set");
  process.exit(1);
}

// ─── load CUAD ─────────────────────────────────────────────────────────────

console.log(`▸ loading CUAD from ${CUAD_PATH}`);
const cuad = JSON.parse(readFileSync(CUAD_PATH, "utf8"));
console.log(`  ${cuad.data.length} documents`);

/**
 * Each document has paragraphs[0].qas — 41 questions with answers.
 * The question format is:
 *   'Highlight the parts (if any) of this contract related to "<Category>" ...'
 * We pull out the quoted category and bucket by it.
 */
function categoryOf(q) {
  const m = q.match(/related to "([^"]+)"/);
  return m ? m[1] : null;
}

const buckets = new Map(); // category → [{ docId, context, answer }]
for (const doc of cuad.data) {
  for (const p of doc.paragraphs) {
    for (const q of p.qas) {
      if (q.is_impossible || !q.answers?.length) continue;
      const cat = categoryOf(q.question);
      if (!cat || !CATEGORIES.includes(cat)) continue;
      if (!buckets.has(cat)) buckets.set(cat, []);
      buckets.get(cat).push({
        docId: doc.title ?? "<unknown>",
        context: p.context,
        question: q.question,
        answer: q.answers[0].text,
      });
    }
  }
}

for (const [cat, items] of buckets) {
  console.log(`  ${cat.padEnd(22)} ${items.length} examples`);
}

// ─── build a Nomos program per category ────────────────────────────────────

function programFor(category, model) {
  const isDate =
    /date|effective|agreement/i.test(category) ||
    category.toLowerCase().includes("date");
  const typeName = `CUAD_${category.replace(/\W+/g, "_")}`;
  const fieldType = isDate ? "Date" : "String";
  return `
type ${typeName} {
  value: ${fieldType}
  verbatim: String
}

fact result: ${typeName} = extract<${typeName}>(contract_text)
  using llm("${model}")

query result
`;
}

// ─── scoring ───────────────────────────────────────────────────────────────

function tokenize(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function f1(pred, gold) {
  const p = new Set(tokenize(pred));
  const g = new Set(tokenize(gold));
  if (p.size === 0 && g.size === 0) return 1;
  if (p.size === 0 || g.size === 0) return 0;
  let common = 0;
  for (const t of p) if (g.has(t)) common++;
  const prec = common / p.size;
  const rec = common / g.size;
  return prec + rec === 0 ? 0 : (2 * prec * rec) / (prec + rec);
}

function exactMatch(pred, gold) {
  return (
    String(pred).trim().toLowerCase() === String(gold).trim().toLowerCase()
  );
}

function contains(pred, gold) {
  const p = String(pred).trim().toLowerCase();
  const g = String(gold).trim().toLowerCase();
  return p.includes(g) || g.includes(p);
}

// ─── run ───────────────────────────────────────────────────────────────────

const started = Date.now();
const perItem = [];

for (const model of MODELS) {
  console.log(`\n━━ MODEL: ${model} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  for (const [category, items] of buckets) {
    const sample = items.slice(0, SAMPLES);
    console.log(`\n▸ ${category} (${sample.length})`);
    const src = programFor(category, model);
    const parsed = parseNomos(src);
    if (!parsed.ast) throw new Error("program parse failed");

    for (const [i, ex] of sample.entries()) {
      const env = envFromJson({ contract_text: ex.context }, "2026-04-18");
      const t0 = Date.now();
      let verbatim = "";
      let confidence = null;
      try {
        const { env: envOut, facts } = await resolveFacts(parsed.ast, env, {
          apiKey: API_KEY,
          appName: "Nomos Benchmark",
          appUrl: "https://nomos.dashable.dev",
          resolveSource: (id) => (id === "contract_text" ? ex.context : ""),
        });
        const resultFact = envOut.facts.get("result");
        if (resultFact && resultFact.kind === "object") {
          const verbatimVal = resultFact.value.verbatim;
          const valueVal = resultFact.value.value;
          verbatim =
            (verbatimVal && verbatimVal.kind === "string"
              ? verbatimVal.value
              : valueVal && valueVal.kind === "string"
                ? valueVal.value
                : valueVal && valueVal.kind === "date"
                  ? valueVal.value
                  : "") ?? "";
        }
        const meta = facts.result;
        confidence = meta?.confidence ?? null;
      } catch (e) {
        console.error(`  ✗ ${i + 1}/${sample.length} error: ${e.message}`);
        continue;
      }
      const t1 = Date.now();

      const em = exactMatch(verbatim, ex.answer);
      const c = contains(verbatim, ex.answer);
      const f = f1(verbatim, ex.answer);

      perItem.push({
        model,
        category,
        docId: ex.docId,
        goldAnswer: ex.answer,
        extracted: verbatim,
        confidence,
        exact_match: em,
        contains: c,
        f1: Number(f.toFixed(3)),
        latencyMs: t1 - t0,
      });

      const icon = em ? "✓" : c ? "~" : "✗";
      process.stdout.write(
        `  ${icon} ${String(i + 1).padStart(2, " ")}/${sample.length}  f1=${f.toFixed(2)}  ${verbatim.slice(0, 60).replace(/\n/g, " ")}\n`,
      );
    }
  }
}

// ─── summary ───────────────────────────────────────────────────────────────

function agg(items) {
  if (items.length === 0)
    return { count: 0, exact_match: 0, contains: 0, mean_f1: 0, mean_conf: 0 };
  const em = items.filter((x) => x.exact_match).length;
  const cont = items.filter((x) => x.contains).length;
  const meanF1 = items.reduce((a, x) => a + x.f1, 0) / items.length;
  const meanConf =
    items.reduce((a, x) => a + (x.confidence ?? 0), 0) / items.length;
  return {
    count: items.length,
    exact_match: +(em / items.length).toFixed(3),
    contains: +(cont / items.length).toFixed(3),
    mean_f1: +meanF1.toFixed(3),
    mean_conf: +meanConf.toFixed(3),
  };
}

const summary = {
  ranAt: new Date().toISOString(),
  models: MODELS,
  samplesPerCategory: SAMPLES,
  perModel: {},
  latencyTotalMs: Date.now() - started,
};

for (const model of MODELS) {
  const modelItems = perItem.filter((x) => x.model === model);
  const byCategory = {};
  for (const [category] of buckets) {
    byCategory[category] = agg(
      modelItems.filter((x) => x.category === category),
    );
  }
  summary.perModel[model] = {
    categories: byCategory,
    overall: agg(modelItems),
  };
}

// Pretty-print: one block per model.
console.log("\n─── SUMMARY ─────────────────────────────────────────────────");
for (const model of MODELS) {
  const s = summary.perModel[model];
  console.log(`\n  ${model}`);
  console.log(
    "    category                count   EM    contains   F1    conf",
  );
  for (const [cat, c] of Object.entries(s.categories)) {
    if (c.count === 0) continue;
    console.log(
      `    ${cat.padEnd(22)}  ${String(c.count).padStart(5, " ")}  ${c.exact_match.toFixed(2)}    ${c.contains.toFixed(2)}       ${c.mean_f1.toFixed(2)}  ${c.mean_conf.toFixed(2)}`,
    );
  }
  const o = s.overall;
  console.log(
    `    ${"OVERALL".padEnd(22)}  ${String(o.count).padStart(5, " ")}  ${o.exact_match.toFixed(2)}    ${o.contains.toFixed(2)}       ${o.mean_f1.toFixed(2)}  ${o.mean_conf.toFixed(2)}`,
  );
}

// ─── persist ───────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
mkdirSync(resolve(__dirname, "results"), { recursive: true });
const out = resolve(
  __dirname,
  "results",
  `cuad-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
);
writeFileSync(out, JSON.stringify({ summary, perItem }, null, 2));
console.log(`\n✓ wrote ${out}`);
