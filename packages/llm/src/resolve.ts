/**
 * Fact resolver.
 *
 * Walks a parsed Nomos Program and, for every `fact X: T = extract<T>(…)`,
 * calls OpenRouter to produce the typed value, then merges the result into
 * the evaluator's Env. After this pass, the sync evaluator can run without
 * caring that LLMs exist.
 *
 * A resolved fact carries provenance metadata (model, confidence, latency)
 * so we can later flag low-confidence facts in the proof tree and route
 * them to a human-in-loop queue.
 */

import type { Env, Program, TypeRef, Value } from "@nomos/core";
import { fromJson } from "@nomos/core";

// Keep Value in the imports so consumers of this module don't have to
// re-import it from core when they inspect env.facts values.
export type { Value };
import { buildTypeIndex, typeRefToSchema } from "./schema.js";
import {
  extractViaOpenRouter,
  type ExtractRequest,
  type ExtractResponse,
} from "./openrouter.js";

export interface ResolveOptions {
  apiKey: string;
  /** Default model if a fact doesn't specify `using llm(...)`. */
  defaultModel?: string;
  /** Called with each resolved fact's metadata — useful for logging. */
  onFact?: (name: string, meta: FactMeta) => void;
  /** App-identification headers. */
  appName?: string;
  appUrl?: string;
  /** Override OpenRouter base URL (testing). */
  baseUrl?: string;
  /** Pass a cache instance, `null` to disable, or omit for the default disk cache. */
  cache?: import("./cache.js").Cache | null;
  /**
   * A host-supplied function that returns the *source text* for the
   * `contract` (or whatever) identifier the user referenced inside
   * `extract<T>(contract)`. If omitted, the identifier's stringified
   * name is used as the source — which is only useful for smoke tests.
   */
  resolveSource?: (identifier: string) => string | Promise<string>;
}

export interface FactMeta {
  kind: "llm";
  model: string;
  confidence: number | null;
  latencyMs: number;
  usage: ExtractResponse["usage"];
  belowThreshold: boolean;
  confidenceThreshold: number | null;
}

export interface ResolveResult {
  /** New env with LLM-resolved facts bound. */
  env: Env;
  /** Per-fact resolution metadata (for tracing + human-in-loop). */
  facts: Record<string, FactMeta>;
  /** Non-fatal notes (e.g. "no API key — skipped extract<Party>"). */
  notes: string[];
}

/**
 * Resolve every LLM-backed fact in the program and merge results into a
 * fresh Env. Non-extract facts are ignored (they're bound from JSON input
 * or evaluated by the core evaluator directly).
 */
export async function resolveFacts(
  program: Program,
  baseEnv: Env,
  opts: ResolveOptions,
): Promise<ResolveResult> {
  const types = buildTypeIndex(program);
  const facts: Record<string, FactMeta> = {};
  const notes: string[] = [];
  const newFacts = new Map<string, Value>(baseEnv.facts);

  for (const decl of program.declarations) {
    if (decl.kind !== "FactDecl") continue;
    if (decl.value.kind !== "ExtractExpr") continue;

    // Skip if the user already supplied this fact via JSON bindings.
    if (baseEnv.facts.has(decl.name)) {
      notes.push(`${decl.name}: using provided binding (LLM skipped)`);
      continue;
    }

    const ex = decl.value;
    const schema = typeRefToSchema(ex.targetType, types);
    const typeName = typeRefLabel(ex.targetType);
    const modelName =
      ex.using?.model ?? opts.defaultModel ?? "claude-sonnet-4-5";

    // Source: resolve via callback, or fall back to the identifier name.
    let source = "";
    if (ex.source.kind === "IdentExpr") {
      source = opts.resolveSource
        ? await opts.resolveSource(ex.source.name)
        : `<binding for '${ex.source.name}'>`;
    } else {
      source = "<complex source expression — not yet supported>";
    }

    const kwargs: Record<string, string> = {};
    for (const k of ex.kwargs) {
      if (k.value.kind === "StringLit") kwargs[k.name] = k.value.value;
      else if (k.value.kind === "NumberLit")
        kwargs[k.name] = String(k.value.value);
    }

    const req: ExtractRequest = {
      schema,
      typeName,
      source,
      kwargs,
      model: modelName,
      apiKey: opts.apiKey,
    };
    if (opts.appName !== undefined) req.appName = opts.appName;
    if (opts.appUrl !== undefined) req.appUrl = opts.appUrl;
    if (opts.baseUrl !== undefined) req.baseUrl = opts.baseUrl;
    if (opts.cache !== undefined) req.cache = opts.cache;

    const response = await extractViaOpenRouter(req);

    const value = fromJson(response.value);
    newFacts.set(decl.name, value);

    const threshold = ex.confidenceThreshold;
    const belowThreshold =
      threshold !== null &&
      response.confidence !== null &&
      response.confidence < threshold;

    const meta: FactMeta = {
      kind: "llm",
      model: response.model,
      confidence: response.confidence,
      latencyMs: response.latencyMs,
      usage: response.usage,
      belowThreshold,
      confidenceThreshold: threshold,
    };
    facts[decl.name] = meta;
    if (opts.onFact) opts.onFact(decl.name, meta);
  }

  return {
    env: { facts: newFacts, asOf: baseEnv.asOf },
    facts,
    notes,
  };
}

function typeRefLabel(ref: TypeRef): string {
  switch (ref.kind) {
    case "NamedType":
      return ref.name;
    case "UnionType":
      return "Enum";
    case "GenericType":
      return `${ref.base}<${ref.args.map(typeRefLabel).join(", ")}>`;
  }
}
