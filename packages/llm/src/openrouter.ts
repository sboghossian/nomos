/**
 * OpenRouter client — thin wrapper over the OpenAI-compatible /chat/completions
 * endpoint with JSON-schema structured output.
 *
 * Design choices:
 *  - No SDK dependency. One fetch call, easy to audit.
 *  - Same code runs in Node (18+) and browsers; we only use `fetch`.
 *  - Alias table resolves friendly model names ("claude-opus-4-7") to
 *    OpenRouter's slug ("anthropic/claude-opus-4.7"). Unknown names pass
 *    through verbatim — that's decision 2.A from our design notes.
 *  - Confidence is optional: the model is asked to self-rate. Low confidence
 *    becomes a signal for the human-in-loop gate, not a hard failure.
 */

import type { JsonSchema } from "./schema.js";

// ─── Model aliases ─────────────────────────────────────────────────────────
// Small, opinionated. If the user writes the full slug, we pass through.
export const MODEL_ALIASES: Record<string, string> = {
  "claude-opus-4-7": "anthropic/claude-opus-4.7",
  "claude-opus-4": "anthropic/claude-opus-4",
  "claude-sonnet-4-5": "anthropic/claude-sonnet-4.5",
  "claude-sonnet-4": "anthropic/claude-sonnet-4",
  "claude-haiku-4": "anthropic/claude-haiku-4",
  "gpt-5": "openai/gpt-5",
  "gpt-4o": "openai/gpt-4o",
  "gemini-2-5-pro": "google/gemini-2.5-pro",
};

export function resolveModel(name: string): string {
  return MODEL_ALIASES[name] ?? name;
}

// ─── Types ─────────────────────────────────────────────────────────────────

export interface ExtractRequest {
  /** The JSON schema the model must return. */
  schema: JsonSchema;
  /** Human-readable name of the target type (e.g. "Party"). */
  typeName: string;
  /** The source text or structured description the model should read. */
  source: string;
  /** Optional named kwargs passed with the extract — e.g. section: "non-compete". */
  kwargs?: Record<string, string>;
  /** Model name or alias (e.g. "claude-opus-4-7"). */
  model: string;
  /** OpenRouter API key. */
  apiKey: string;
  /** App-identification headers for OpenRouter's dashboards. */
  appName?: string;
  appUrl?: string;
  /** Temperature for sampling. Default 0 — we want determinism. */
  temperature?: number;
  /** Hard timeout in ms. */
  timeoutMs?: number;
  /** Override the OpenRouter base URL (e.g. for testing). */
  baseUrl?: string;
}

export interface ExtractResponse {
  /** The extracted value, shaped per the schema. */
  value: unknown;
  /** Model's self-rated confidence in [0, 1], if it provided one. */
  confidence: number | null;
  /** Token usage, if the provider returned it. */
  usage: { prompt: number; completion: number; total: number } | null;
  /** Raw model identifier used (post-alias resolution). */
  model: string;
  /** Latency in milliseconds. */
  latencyMs: number;
}

// ─── Entry point ───────────────────────────────────────────────────────────

export async function extractViaOpenRouter(
  req: ExtractRequest,
): Promise<ExtractResponse> {
  const baseUrl = req.baseUrl ?? "https://openrouter.ai/api/v1";
  const model = resolveModel(req.model);
  const timeoutMs = req.timeoutMs ?? 60_000;

  const systemPrompt = buildSystemPrompt(req.typeName);
  const userPrompt = buildUserPrompt(req.source, req.kwargs);

  // OpenRouter follows OpenAI's response_format spec for structured output.
  const body = {
    model,
    temperature: req.temperature ?? 0,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: req.typeName.replace(/[^a-zA-Z0-9_]/g, "_"),
        strict: true,
        schema: wrapWithConfidence(req.schema),
      },
    },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  let resp: Response;
  try {
    resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${req.apiKey}`,
        "HTTP-Referer": req.appUrl ?? "https://nomos.dashable.dev",
        "X-Title": req.appName ?? "Nomos",
      },
      body: JSON.stringify(body),
    });
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - started;

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    throw new Error(
      `OpenRouter ${resp.status} ${resp.statusText}: ${errText.slice(0, 400)}`,
    );
  }

  const json = (await resp.json()) as OpenRouterResponse;
  const raw = json.choices?.[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenRouter returned no content");
  }

  let parsed: { value: unknown; confidence?: unknown };
  try {
    parsed = JSON.parse(raw) as { value: unknown; confidence?: unknown };
  } catch (e) {
    throw new Error(`model returned non-JSON: ${(e as Error).message}`);
  }

  const confidence =
    typeof parsed.confidence === "number" &&
    parsed.confidence >= 0 &&
    parsed.confidence <= 1
      ? parsed.confidence
      : null;

  return {
    value: parsed.value,
    confidence,
    usage: json.usage
      ? {
          prompt: json.usage.prompt_tokens ?? 0,
          completion: json.usage.completion_tokens ?? 0,
          total: json.usage.total_tokens ?? 0,
        }
      : null,
    model,
    latencyMs,
  };
}

// ─── Prompt building ───────────────────────────────────────────────────────

function buildSystemPrompt(typeName: string): string {
  return [
    `You are a structured-extraction assistant for the Nomos legal-reasoning language.`,
    `Your task is to extract a ${typeName} from the provided source.`,
    ``,
    `Rules:`,
    `1. Return JSON matching the schema exactly. No extra fields.`,
    `2. If information is missing, make the most legally-reasonable inference and lower your confidence accordingly.`,
    `3. Set \`confidence\` in [0, 1] based on how certain you are the extracted value is correct.`,
    `4. Do not include commentary, explanations, or markdown. JSON only.`,
  ].join("\n");
}

function buildUserPrompt(
  source: string,
  kwargs: Record<string, string> | undefined,
): string {
  const hints = kwargs
    ? Object.entries(kwargs)
        .map(([k, v]) => `- ${k}: ${v}`)
        .join("\n")
    : "";
  return [
    "Source:",
    "```",
    source,
    "```",
    hints ? `\nHints:\n${hints}` : "",
  ].join("\n");
}

/**
 * We wrap the user's schema in an outer envelope `{ value: <userSchema>, confidence: number }`
 * so the model is forced to self-rate without us having to change the user's type.
 */
function wrapWithConfidence(inner: JsonSchema): JsonSchema {
  return {
    type: "object",
    properties: {
      value: inner,
      confidence: {
        type: "number",
        description:
          "Your self-rated confidence in the extracted value, between 0 and 1.",
      },
    },
    required: ["value", "confidence"],
    additionalProperties: false,
  };
}

// ─── OpenRouter response shape (minimal) ───────────────────────────────────

interface OpenRouterResponse {
  id?: string;
  model?: string;
  choices?: {
    message?: { role: string; content?: string };
    finish_reason?: string;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: { message?: string };
}
