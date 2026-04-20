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
import { bold, cyan, dim, red, yellow, gray } from "./tty.js";
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
    `  ${cyan("nomos help")}`,
    `  ${cyan("nomos version")}`,
    "",
    bold("Examples"),
    `  ${dim("$")} nomos run contract.nomos --input facts.json`,
    `  ${dim("$")} nomos run contract.nomos --as-of 2015-01-01`,
    `  ${dim("$")} nomos parse contract.nomos`,
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

function runRun(
  file: string,
  inputPath: string | undefined,
  asOf: string | undefined,
): void {
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
    const env = envFromJson(inputs, effectiveAsOf);
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

const { cmd, positional, flags } = readArgs(process.argv.slice(2));

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

  case "run":
    if (!positional[0]) fail("nomos run needs a file");
    runRun(positional[0], flags.get("input"), flags.get("as-of"));
    break;

  default:
    console.error(red("unknown command: ") + cmd);
    console.error(gray("try ") + cyan("nomos help"));
    process.exit(1);
}
