/**
 * A tiny on-disk cache for LLM extractions.
 *
 * Goal: re-running the same Nomos program with the same inputs should
 * not re-charge OpenRouter. The cache key is a hash of the three things
 * that actually affect the result: the model, the source text, and the
 * JSON schema. Anything that doesn't change the LLM's output doesn't
 * change the cache key — that's the point.
 *
 * Store: content-addressed JSON files under `.nomos-cache/` (gitignored
 * by convention). Default location is the CWD; overridable via
 * NOMOS_CACHE_DIR. In-memory mode (no disk) is supported for browsers.
 *
 * Schema versioning: the cache envelope includes a small `v` field. Bump
 * it when the serialization format changes; older entries simply miss.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ExtractResponse } from "./openrouter.js";

const CACHE_FORMAT_VERSION = 1;

export interface CacheKeyParts {
  /** Resolved OpenRouter model slug. */
  model: string;
  /** The full user-visible source text handed to the LLM. */
  source: string;
  /** JSON schema the model was asked to return. */
  schema: unknown;
  /** Type name (Party, Clause, etc.) — small but changes the system prompt. */
  typeName: string;
  /** Kwargs that alter the prompt (e.g. section hints). */
  kwargs?: Record<string, string>;
}

interface CacheEnvelope {
  v: number;
  key: string;
  createdAt: string;
  response: ExtractResponse;
}

export interface Cache {
  /** Return a cached response if key hits; `null` otherwise. */
  get(key: CacheKeyParts): ExtractResponse | null;
  /** Store a response under `key`. Errors are swallowed. */
  set(key: CacheKeyParts, value: ExtractResponse): void;
}

// ─── Key hashing ───────────────────────────────────────────────────────────

/**
 * Stable hash over the inputs that actually affect the LLM's output.
 * Keys are sorted when we serialize `schema` + `kwargs` so field-order
 * changes don't miss the cache.
 */
export function hashCacheKey(parts: CacheKeyParts): string {
  const canonical = JSON.stringify({
    v: CACHE_FORMAT_VERSION,
    model: parts.model,
    source: parts.source,
    schema: sortKeys(parts.schema),
    typeName: parts.typeName,
    kwargs: parts.kwargs ? sortKeys(parts.kwargs) : null,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      out[k] = sortKeys((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

// ─── On-disk cache ─────────────────────────────────────────────────────────

export class DiskCache implements Cache {
  constructor(private dir: string) {
    try {
      mkdirSync(this.dir, { recursive: true });
    } catch {
      /* swallow — writes will fail later and be silently skipped */
    }
  }

  private path(key: string): string {
    return join(this.dir, `${key}.json`);
  }

  get(keyParts: CacheKeyParts): ExtractResponse | null {
    const key = hashCacheKey(keyParts);
    const p = this.path(key);
    if (!existsSync(p)) return null;
    try {
      const env = JSON.parse(readFileSync(p, "utf8")) as CacheEnvelope;
      if (env.v !== CACHE_FORMAT_VERSION) return null;
      return env.response;
    } catch {
      return null;
    }
  }

  set(keyParts: CacheKeyParts, response: ExtractResponse): void {
    const key = hashCacheKey(keyParts);
    const env: CacheEnvelope = {
      v: CACHE_FORMAT_VERSION,
      key,
      createdAt: new Date().toISOString(),
      response,
    };
    try {
      writeFileSync(this.path(key), JSON.stringify(env));
    } catch {
      /* swallow */
    }
  }
}

// ─── In-memory cache ───────────────────────────────────────────────────────

export class MemoryCache implements Cache {
  private store = new Map<string, ExtractResponse>();
  get(keyParts: CacheKeyParts): ExtractResponse | null {
    return this.store.get(hashCacheKey(keyParts)) ?? null;
  }
  set(keyParts: CacheKeyParts, response: ExtractResponse): void {
    this.store.set(hashCacheKey(keyParts), response);
  }
}

/** Null cache — for callers that want to explicitly disable caching. */
export class NullCache implements Cache {
  get(): null {
    return null;
  }
  set(): void {}
}

/**
 * Default cache — on disk under ./.nomos-cache unless NOMOS_CACHE_DIR is set.
 * Returns a MemoryCache when run in a non-Node environment.
 */
export function defaultCache(): Cache {
  if (typeof process === "undefined" || !process.env) return new MemoryCache();
  if (process.env["NOMOS_CACHE_DISABLED"] === "1") return new NullCache();
  const dir = process.env["NOMOS_CACHE_DIR"] ?? resolve(".nomos-cache");
  return new DiskCache(dir);
}
