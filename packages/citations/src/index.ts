/**
 * @nomos/citations — citation resolver.
 *
 * Takes a Nomos `AuthorityRef` and resolves it to a structured citation
 * with (where possible) a year, court, reporter, and canonical string
 * that matches one of the established citation conventions.
 *
 * US citations go through Eyecite (Free Law Project) via a long-lived
 * Python subprocess. Non-US publishers pass through unresolved with a
 * note — we'll add Akoma Ntoso lookups for FR/EU later.
 *
 * The resolver is safe-by-default: if Python or Eyecite is unavailable,
 * it returns `{ resolved: false }` and never crashes the caller.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { AuthorityRef } from "@nomos/core";

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Resolution {
  /** True if we produced a structured citation. */
  resolved: boolean;
  /** What the original authority was. */
  ref: AuthorityRef;
  /** Source of the resolution (eyecite, pass-through, etc.). */
  resolver: string;
  /** Best-effort canonical string. */
  canonical: string;
  /** Year of decision/enactment, if known. */
  year: number | null;
  /** Reporter / publisher normalization (e.g. "U.S.", "F.3d"). */
  reporter: string | null;
  /** Human-readable note — why we resolved or failed. */
  note: string;
}

// ─── Publisher classification ──────────────────────────────────────────────

const US_PUBLISHERS = new Set([
  "scotus",
  "us",
  "federal_register",
  "fed_reg",
  "cfr",
  "usc",
  "us_code",
  "uscode",
]);

function isUsPublisher(source: string): boolean {
  const s = source.toLowerCase();
  return (
    US_PUBLISHERS.has(s) ||
    /^[0-9]+\s*u\.?s\.?$/.test(s) || // e.g. "347 U.S."
    /^f\.?[0-9]*d?$/.test(s) // e.g. "F.3d"
  );
}

// ─── Eyecite subprocess ────────────────────────────────────────────────────
//
// Lazy-started, long-lived. Each resolution is one line in / one line out.
// Startup is ~1s (Python + eyecite imports); amortized across many calls.

let bridge: ChildProcessWithoutNullStreams | null = null;
let bridgeBuffer = "";
let bridgeQueue: ((r: EyeciteResponse) => void)[] = [];
let bridgeDisabled = false;

interface EyeciteResponse {
  id: string;
  citations?: {
    type: string;
    cite?: string;
    case_name?: string;
    year?: number;
    court?: string;
    reporter?: string;
    volume?: string;
    page?: string;
    section?: string;
  }[];
  error?: string;
}

function getBridge(): ChildProcessWithoutNullStreams | null {
  if (bridgeDisabled) return null;
  if (bridge && !bridge.killed) return bridge;

  const here = dirname(fileURLToPath(import.meta.url));
  const script = join(here, "..", "scripts", "eyecite_bridge.py");

  try {
    bridge = spawn("python3", [script], { stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    bridgeDisabled = true;
    return null;
  }

  bridge.on("error", () => {
    bridgeDisabled = true;
    bridge = null;
  });
  bridge.on("exit", () => {
    bridge = null;
  });
  bridge.stderr.on("data", (c) => {
    // Surface import errors, crashes, etc.
    if (String(c).includes("error:")) bridgeDisabled = true;
  });
  bridge.stdout.on("data", (c) => {
    bridgeBuffer += String(c);
    let idx: number;
    while ((idx = bridgeBuffer.indexOf("\n")) >= 0) {
      const line = bridgeBuffer.slice(0, idx);
      bridgeBuffer = bridgeBuffer.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as EyeciteResponse;
        const next = bridgeQueue.shift();
        if (next) next(msg);
      } catch {
        // drop malformed line
      }
    }
  });

  return bridge;
}

async function askEyecite(text: string): Promise<EyeciteResponse | null> {
  const b = getBridge();
  if (!b || !b.stdin.writable) return null;
  return new Promise<EyeciteResponse>((resolve) => {
    bridgeQueue.push(resolve);
    b.stdin.write(JSON.stringify({ id: String(Date.now()), text }) + "\n");
  });
}

// ─── Resolver ──────────────────────────────────────────────────────────────

export async function resolveAuthority(ref: AuthorityRef): Promise<Resolution> {
  // Non-US publishers: pass through. We'll add Akoma-Ntoso lookups next.
  if (!isUsPublisher(ref.source)) {
    return {
      resolved: false,
      ref,
      resolver: "pass-through",
      canonical: ref.canonical,
      year: null,
      reporter: null,
      note: `non-US publisher "${ref.source}" — resolver not yet configured`,
    };
  }

  // US path — hand a synthesized citation string to Eyecite.
  const synthesized = buildUsCitationText(ref);
  const eye = await askEyecite(synthesized);

  if (!eye || eye.error || !eye.citations || eye.citations.length === 0) {
    return {
      resolved: false,
      ref,
      resolver: "eyecite",
      canonical: ref.canonical,
      year: null,
      reporter: null,
      note: eye?.error
        ? `eyecite error: ${eye.error}`
        : `no citation matched "${synthesized}"`,
    };
  }

  const c = eye.citations[0]!;
  return {
    resolved: true,
    ref,
    resolver: "eyecite",
    canonical: c.cite ?? ref.canonical,
    year: c.year ?? null,
    reporter: c.reporter ?? null,
    note: `matched by eyecite (${c.type})`,
  };
}

/**
 * Synthesize a plausible US citation string from a Nomos AuthorityRef so
 * Eyecite has something to pattern-match. This is intentionally lossy —
 * Nomos's citation shape is more flexible than any single jurisdiction's.
 */
function buildUsCitationText(ref: AuthorityRef): string {
  if (ref.citationKind === "article") {
    // e.g. usc.art("§ 1983") → "42 U.S.C. § 1983"
    return `${ref.source.toUpperCase()} § ${ref.primary}`;
  }
  if (ref.citationKind === "case") {
    // e.g. scotus(1954-05-17, "347 U.S. 483") → "347 U.S. 483 (1954)"
    const year = ref.date?.slice(0, 4);
    return year ? `${ref.primary} (${year})` : ref.primary;
  }
  return ref.canonical;
}

// ─── Bulk API ──────────────────────────────────────────────────────────────

export async function resolveAuthorities(
  refs: AuthorityRef[],
): Promise<Resolution[]> {
  const out: Resolution[] = [];
  for (const ref of refs) out.push(await resolveAuthority(ref));
  return out;
}

/** Politely shut down the Python subprocess. */
export function shutdown(): void {
  if (bridge && !bridge.killed) {
    bridge.stdin.end();
    bridge = null;
  }
}

/** True if Eyecite is available (Python + package installed). */
export async function isResolverAvailable(): Promise<boolean> {
  const b = getBridge();
  if (!b) return false;
  // Ping with a canonical citation that always matches.
  const resp = await Promise.race([
    askEyecite("347 U.S. 483 (1954)"),
    new Promise<null>((r) => setTimeout(() => r(null), 8000)),
  ]);
  return !!resp && !resp.error;
}

// Re-export the canonical span of helpers so downstream doesn't have to
// know they live in a subprocess.
export { once };
