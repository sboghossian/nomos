#!/usr/bin/env node
/**
 * `nomos` — the Nomos command-line tool.
 *
 * Subcommands:
 *   nomos run <file> [--input <json>] [--as-of <date>]
 *   nomos parse <file>
 *   nomos check <file>
 *   nomos help
 *
 * No external arg-parser — Nomos is a language about clarity. The CLI
 * should be legible, not clever.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse, check, evaluate, envFromJson, prettyPrint } from "@nomos/core";
import { resolveFacts } from "@nomos/llm";
import {
  resolveAuthorities,
  isResolverAvailable,
  shutdown as shutdownCitations,
} from "@nomos/citations";
import { bold, cyan, dim, green, red, yellow, gray } from "./tty.js";
import { renderDiagnostics, renderResult } from "./render.js";

const VERSION = "0.0.1";

function usage(): string {
  return [
    bold("Nomos") + dim(" · a programming language for legal reasoning"),
    "",
    bold("Usage"),
    `  ${cyan("nomos run")}   <file.nomos> [--input <file.json>] [--as-of <YYYY-MM-DD>]`,
    `  ${cyan("nomos parse")} <file.nomos>`,
    `  ${cyan("nomos check")} <file.nomos>`,
    `  ${cyan("nomos resolve")} <file.nomos>   ${dim("— resolve authorities via Eyecite")}`,
    `  ${cyan("nomos help")}`,
    `  ${cyan("nomos version")}`,
    "",
    bold("Examples"),
    `  ${dim("$")} nomos run contract.nomos --input facts.json`,
    `  ${dim("$")} nomos run contract.nomos --as-of 2015-01-01`,
    `  ${dim("$")} nomos run contract.nomos --with-llm --model claude-opus-4-7`,
    `  ${dim("$")} nomos parse contract.nomos`,
    "",
    bold("Flags"),
    `  ${dim("--input   ")} path to JSON fact bindings (auto-detects sibling .input.json)`,
    `  ${dim("--as-of   ")} override the query's as-of date (YYYY-MM-DD)`,
    `  ${dim("--with-llm")} resolve extract<T> facts via OpenRouter (needs OPENROUTER_API_KEY)`,
    `  ${dim("--model   ")} default model alias for extract<T> (e.g. claude-sonnet-4-5)`,
    "",
    dim("See nomos-lang.dev for language docs."),
  ].join("\n");
}

function fail(msg: string, code = 1): never {
  console.error(red("error: ") + msg);
  process.exit(code);
}

function readArgs(argv: string[]): {
  cmd: string;
  positional: string[];
  flags: Map<string, string>;
  boolFlags: Set<string>;
} {
  const [cmd, ...rest] = argv;
  const positional: string[] = [];
  const flags = new Map<string, string>();
  const boolFlags = new Set<string>();

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags.set(key, next);
        i++;
      } else {
        boolFlags.add(key);
      }
    } else {
      positional.push(a);
    }
  }
  return { cmd: cmd ?? "", positional, flags, boolFlags };
}

function loadSource(file: string): { path: string; src: string } {
  try {
    const path = resolve(file);
    const src = readFileSync(path, "utf8");
    return { path, src };
  } catch (e) {
    fail(`cannot read ${file}: ${(e as Error).message}`);
  }
}

function runParse(file: string): void {
  const { src } = loadSource(file);
  const parsed = parse(src);
  if (parsed.lexErrors.length + parsed.parseErrors.length > 0) {
    const diags = [
      ...parsed.lexErrors.map((e) => ({ severity: "error" as const, ...e })),
      ...parsed.parseErrors.map((e) => ({ severity: "error" as const, ...e })),
    ];
    console.error(renderDiagnostics(diags, "PARSE ERRORS"));
    process.exit(1);
  }
  console.log(prettyPrint(parsed.ast!));
}

async function runResolve(file: string): Promise<void> {
  const { src } = loadSource(file);
  const parsed = parse(src);
  if (parsed.lexErrors.length + parsed.parseErrors.length > 0) {
    const diags = [
      ...parsed.lexErrors.map((e) => ({ severity: "error" as const, ...e })),
      ...parsed.parseErrors.map((e) => ({ severity: "error" as const, ...e })),
    ];
    console.error(renderDiagnostics(diags, "PARSE ERRORS"));
    process.exit(1);
  }

  const program = parsed.ast!;
  const refs = program.declarations.flatMap((d) =>
    d.kind === "RuleDecl" ? d.authorities : [],
  );
  if (refs.length === 0) {
    console.log(dim("no authorities to resolve"));
    return;
  }

  const available = await isResolverAvailable();
  if (!available) {
    console.error(
      yellow("warn: ") +
        "eyecite unavailable (install with: pip3 install eyecite)",
    );
  }

  const resolutions = await resolveAuthorities(refs);

  console.log(dim("─── AUTHORITIES ─").padEnd(64, "─"));
  for (const r of resolutions) {
    const icon = r.resolved ? green("✓") : gray("○");
    const reporter = r.reporter ? `  ${dim("reporter")} ${r.reporter}` : "";
    const year = r.year ? `  ${dim("year")} ${r.year}` : "";
    console.log(
      `  ${icon} ${bold(r.ref.canonical)}  ${gray("via " + r.resolver)}${reporter}${year}`,
    );
    if (!r.resolved) {
      console.log(`      ${gray("note:")} ${r.note}`);
    }
  }
  shutdownCitations();
}

function runCheck(file: string): void {
  const { src } = loadSource(file);
  const parsed = parse(src);
  if (parsed.lexErrors.length + parsed.parseErrors.length > 0) {
    const diags = [
      ...parsed.lexErrors.map((e) => ({ severity: "error" as const, ...e })),
      ...parsed.parseErrors.map((e) => ({ severity: "error" as const, ...e })),
    ];
    console.error(renderDiagnostics(diags, "PARSE ERRORS"));
    process.exit(1);
  }
  const checked = check(parsed.ast!);
  if (checked.diagnostics.length === 0) {
    console.log(dim("✓ no issues"));
    return;
  }
  console.log(renderDiagnostics(checked.diagnostics, "DIAGNOSTICS"));
  if (checked.diagnostics.some((d) => d.severity === "error")) process.exit(1);
}

async function runRun(
  file: string,
  inputPath: string | undefined,
  asOf: string | undefined,
  withLlm: boolean,
  model: string | undefined,
): Promise<void> {
  const { src } = loadSource(file);
  const parsed = parse(src);
  if (parsed.lexErrors.length + parsed.parseErrors.length > 0) {
    const diags = [
      ...parsed.lexErrors.map((e) => ({ severity: "error" as const, ...e })),
      ...parsed.parseErrors.map((e) => ({ severity: "error" as const, ...e })),
    ];
    console.error(renderDiagnostics(diags, "PARSE ERRORS"));
    process.exit(1);
  }

  const program = parsed.ast!;
  const checked = check(program);
  const errors = checked.diagnostics.filter((d) => d.severity === "error");
  if (errors.length) {
    console.error(renderDiagnostics(errors, "CHECK ERRORS"));
    process.exit(1);
  }

  const queries = program.declarations.filter(
    (d): d is Extract<typeof d, { kind: "QueryDecl" }> =>
      d.kind === "QueryDecl",
  );
  if (queries.length === 0) {
    fail(`no queries in ${file}`);
  }

  // Load fact bindings if provided.
  let inputs: Record<string, unknown> = {};
  if (inputPath) {
    try {
      inputs = JSON.parse(readFileSync(resolve(inputPath), "utf8")) as Record<
        string,
        unknown
      >;
    } catch (e) {
      fail(`cannot read input ${inputPath}: ${(e as Error).message}`);
    }
  } else {
    // Try sibling .input.json by convention.
    const guess = file.replace(/\.nomos$/, ".input.json");
    try {
      inputs = JSON.parse(readFileSync(resolve(guess), "utf8")) as Record<
        string,
        unknown
      >;
      console.error(dim(`(using sibling inputs: ${guess})`));
    } catch {
      console.error(
        yellow("warn: ") + "no --input given and no sibling .input.json found",
      );
    }
  }

  for (const q of queries) {
    const effectiveAsOf =
      asOf ?? q.asOf ?? new Date().toISOString().slice(0, 10);
    let env = envFromJson(inputs, effectiveAsOf);

    // ── LLM fact resolution ────────────────────────────────────────────
    if (withLlm) {
      const apiKey = process.env["OPENROUTER_API_KEY"];
      if (!apiKey) {
        console.error(
          red("error: ") +
            "--with-llm requires OPENROUTER_API_KEY in the environment",
        );
        process.exit(1);
      }
      console.error(dim("resolving extract<T> facts via OpenRouter..."));
      const opts = {
        apiKey,
        appName: process.env["NOMOS_APP_NAME"] ?? "Nomos",
        appUrl: process.env["NOMOS_APP_URL"] ?? "https://nomos.dashable.dev",
        /** Extract's source identifier resolves against the input JSON bindings. */
        resolveSource: (id: string): string => {
          const v = inputs[id];
          if (typeof v === "string") return v;
          if (v && typeof v === "object") return JSON.stringify(v, null, 2);
          return `<no binding for '${id}' in input JSON>`;
        },
        onFact: (
          name: string,
          m: {
            model: string;
            confidence: number | null;
            latencyMs: number;
            belowThreshold: boolean;
          },
        ) => {
          const conf =
            m.confidence === null ? "?" : (m.confidence * 100).toFixed(0) + "%";
          const icon = m.belowThreshold ? yellow("⚠") : green("✓");
          console.error(
            `  ${icon} ${dim(name)}  ${gray(m.model)}  ${dim("conf")} ${conf}  ${dim("→")} ${m.latencyMs}ms`,
          );
        },
      } as const;
      const withModel = model ? { ...opts, defaultModel: model } : opts;
      const resolved = await resolveFacts(program, env, withModel);
      env = resolved.env;

      // Show what the LLM actually extracted so users can audit.
      console.error();
      console.error(dim("─── EXTRACTED FACTS") + dim(" " + "─".repeat(42)));
      for (const factName of Object.keys(resolved.facts)) {
        const v = env.facts.get(factName);
        const pretty = valueToString(v);
        console.error(`  ${cyan(factName)} ${dim("=")} ${pretty}`);
      }
      console.error();
    }

    const result = evaluate(program, q, env);
    const label =
      q.expression.kind === "IdentExpr" ? q.expression.name : "<query>";
    console.log(renderResult(result, label));
  }

  // Surface warnings at the bottom — non-blocking.
  const warns = checked.diagnostics.filter((d) => d.severity === "warning");
  if (warns.length) {
    console.log();
    console.log(renderDiagnostics(warns, "WARNINGS"));
  }
}

// ─── main ──────────────────────────────────────────────────────────────────

const { cmd, positional, flags, boolFlags } = readArgs(process.argv.slice(2));

// Load .env if present (lightweight, no dotenv dep).
loadDotEnv();

function valueToString(v: unknown): string {
  if (v === undefined) return "undefined";
  const inner = (x: unknown): string => {
    if (!x || typeof x !== "object") return JSON.stringify(x);
    const o = x as { kind?: string; value?: unknown };
    if (o.kind === "bool") return String(o.value);
    if (o.kind === "number") return String(o.value);
    if (o.kind === "string") return JSON.stringify(o.value);
    if (o.kind === "date") return String(o.value);
    if (o.kind === "null") return "null";
    if (o.kind === "list" && Array.isArray(o.value))
      return "[" + o.value.map(inner).join(", ") + "]";
    if (o.kind === "object" && o.value && typeof o.value === "object") {
      const entries = Object.entries(o.value as Record<string, unknown>)
        .map(([k, vv]) => `${k}: ${inner(vv)}`)
        .join(", ");
      return "{ " + entries + " }";
    }
    return JSON.stringify(x);
  };
  return inner(v);
}

function loadDotEnv(): void {
  try {
    const fs = readFileSync(resolve(".env"), "utf8");
    for (const line of fs.split("\n")) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
      if (!m) continue;
      const [, k, rawV] = m;
      if (k && rawV !== undefined && !process.env[k]) {
        const v = rawV.trim().replace(/^["']|["']$/g, "");
        process.env[k] = v;
      }
    }
  } catch {
    // no .env — fine.
  }
}

switch (cmd) {
  case "":
  case "help":
  case "--help":
  case "-h":
    console.log(usage());
    break;

  case "version":
  case "--version":
  case "-v":
    console.log(`nomos ${VERSION}`);
    break;

  case "parse":
    if (!positional[0])
      fail("nomos parse needs a file — see " + cyan("nomos help"));
    runParse(positional[0]);
    break;

  case "check":
    if (!positional[0]) fail("nomos check needs a file");
    runCheck(positional[0]);
    break;

  case "resolve":
    if (!positional[0]) fail("nomos resolve needs a file");
    runResolve(positional[0]).catch((err: Error) => {
      console.error(red("error: ") + err.message);
      process.exit(1);
    });
    break;

  case "run":
    if (!positional[0]) fail("nomos run needs a file");
    runRun(
      positional[0],
      flags.get("input"),
      flags.get("as-of"),
      boolFlags.has("with-llm"),
      flags.get("model"),
    ).catch((err: Error) => {
      console.error(red("error: ") + err.message);
      process.exit(1);
    });
    break;

  default:
    console.error(red("unknown command: ") + cmd);
    console.error(gray("try ") + cyan("nomos help"));
    process.exit(1);
}
