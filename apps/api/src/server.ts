/**
 * Nomos playground API — a tiny HTTP proxy.
 *
 * Purpose: the browser playground needs to call OpenRouter to run
 * `extract<T>`, but shipping an API key to the browser is a no-go. This
 * server holds the key and exposes two endpoints behind rate-limiting:
 *
 *   POST /resolve   — given a parsed program + facts + asOf, resolves all
 *                     LLM-backed facts and returns the enriched env.
 *   GET  /health    — liveness check.
 *
 * Design choices:
 *  - No framework. `node:http` + JSON. Zero Express/Fastify/Hono surface.
 *  - In-memory per-IP rate limiting (sliding window, ~20 calls/hour).
 *    Good enough for a side project's public playground; replace with
 *    Redis or Cloudflare rate-limit if traffic ever justifies it.
 *  - CORS open to the tunnel's origins only (and localhost for dev).
 *  - The server re-parses the program server-side (single source of
 *    truth), so clients can't inject rules via JSON.
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { parse, envFromJson } from "@nomos/core";
import { resolveFacts } from "@nomos/llm";

// ─── .env loader (zero-dep) ────────────────────────────────────────────────

function loadDotEnv(): void {
  for (const candidate of [".env", "../../.env"]) {
    try {
      const raw = readFileSync(resolvePath(candidate), "utf8");
      for (const line of raw.split("\n")) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/i);
        if (!m) continue;
        const [, k, rawV] = m;
        if (k && rawV !== undefined && !process.env[k]) {
          process.env[k] = rawV.trim().replace(/^["']|["']$/g, "");
        }
      }
      return;
    } catch {
      // try next candidate
    }
  }
}
loadDotEnv();

const API_KEY = process.env["OPENROUTER_API_KEY"];
const PORT = Number(process.env["NOMOS_API_PORT"] ?? 4330);
const APP_NAME = process.env["NOMOS_APP_NAME"] ?? "Nomos Playground";
const APP_URL = process.env["NOMOS_APP_URL"] ?? "https://nomos.dashable.dev";

if (!API_KEY) {
  console.error("✖ OPENROUTER_API_KEY not set in environment or .env file");
  process.exit(1);
}

// ─── Allowed origins ───────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  "https://nomos.dashable.dev",
  "http://localhost:4325",
  "http://localhost:3000",
  "http://localhost:4321",
  "http://localhost:4322",
  "http://localhost:4323",
  "http://127.0.0.1:4325",
]);

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

// ─── Rate limiting (in-memory sliding window) ──────────────────────────────

const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const LIMIT_PER_IP = 20;
const hits = new Map<string, number[]>();

function rateLimit(ip: string): {
  ok: boolean;
  remaining: number;
  resetIn: number;
} {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= LIMIT_PER_IP) {
    const oldest = arr[0]!;
    return {
      ok: false,
      remaining: 0,
      resetIn: Math.ceil((WINDOW_MS - (now - oldest)) / 1000),
    };
  }
  arr.push(now);
  hits.set(ip, arr);
  return { ok: true, remaining: LIMIT_PER_IP - arr.length, resetIn: 0 };
}

function clientIp(req: IncomingMessage): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string") return xf.split(",")[0]!.trim();
  if (Array.isArray(xf) && xf[0]) return xf[0];
  return req.socket.remoteAddress ?? "unknown";
}

// ─── Helpers ───────────────────────────────────────────────────────────────

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...headers,
  });
  res.end(JSON.stringify(body));
}

// ─── Handlers ──────────────────────────────────────────────────────────────

interface ResolveBody {
  source?: string;
  inputs?: Record<string, unknown>;
  asOf?: string;
  defaultModel?: string;
}

async function handleResolve(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const ip = clientIp(req);
  const limit = rateLimit(ip);
  res.setHeader("X-RateLimit-Remaining", String(limit.remaining));
  if (!limit.ok) {
    sendJson(res, 429, {
      error: "rate_limited",
      message: `Too many LLM calls. Try again in ${limit.resetIn}s.`,
      retry_after_seconds: limit.resetIn,
    });
    return;
  }

  let body: ResolveBody;
  try {
    body = (await readJson(req)) as ResolveBody;
  } catch (e) {
    sendJson(res, 400, { error: "bad_json", message: (e as Error).message });
    return;
  }

  if (!body.source || typeof body.source !== "string") {
    sendJson(res, 400, {
      error: "missing_source",
      message: "source is required",
    });
    return;
  }
  if (body.source.length > 20_000) {
    sendJson(res, 413, {
      error: "source_too_large",
      message: "source exceeds 20,000 chars",
    });
    return;
  }

  const parsed = parse(body.source);
  if (!parsed.ast) {
    sendJson(res, 422, {
      error: "parse_failed",
      lexErrors: parsed.lexErrors,
      parseErrors: parsed.parseErrors,
    });
    return;
  }

  const asOf =
    body.asOf ??
    parsed.ast.declarations.find((d) => d.kind === "QueryDecl")?.asOf ??
    new Date().toISOString().slice(0, 10);
  const inputs = body.inputs ?? {};
  const env = envFromJson(inputs, asOf);

  try {
    const opts: Parameters<typeof resolveFacts>[2] = {
      apiKey: API_KEY!,
      appName: APP_NAME,
      appUrl: APP_URL,
      resolveSource: (id: string): string => {
        const v = inputs[id];
        if (typeof v === "string") return v;
        if (v && typeof v === "object") return JSON.stringify(v, null, 2);
        return `<no binding for '${id}'>`;
      },
    };
    if (body.defaultModel) opts.defaultModel = body.defaultModel;

    const resolved = await resolveFacts(parsed.ast, env, opts);

    // Serialize the env.facts Map into a plain object for the wire.
    const bound: Record<string, unknown> = {};
    for (const [k, v] of resolved.env.facts.entries()) {
      bound[k] = v;
    }

    sendJson(res, 200, {
      asOf: resolved.env.asOf,
      facts: bound,
      meta: resolved.facts,
      notes: resolved.notes,
      remaining: limit.remaining,
    });
  } catch (e) {
    console.error("[resolve] error:", (e as Error).message);
    sendJson(res, 502, {
      error: "upstream_error",
      message: (e as Error).message,
    });
  }
}

// ─── Server ────────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  if (url.pathname === "/health" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      service: "@nomos/api",
      version: "0.0.1",
      uptime_s: Math.floor(process.uptime()),
    });
    return;
  }

  if (url.pathname === "/resolve" && req.method === "POST") {
    await handleResolve(req, res);
    return;
  }

  sendJson(res, 404, { error: "not_found", path: url.pathname });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(
    `nomos-api listening on 0.0.0.0:${PORT} · rate limit ${LIMIT_PER_IP}/hour per IP`,
  );
});
