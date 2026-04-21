/**
 * Ensemble extraction — call N models on the same prompt and combine.
 *
 * Why this exists: the model's self-rated confidence is known to be
 * overconfident. A much stronger signal is ensemble agreement — if three
 * different models, from different labs, produce the same extracted
 * value, we trust it. If they disagree, we have a real signal to route
 * the case to a human.
 *
 * Returns:
 *   - value:    the consensus value (majority pick by deep equality)
 *   - agreement: fraction of models that voted for the winner ∈ [0, 1]
 *   - perModel: every model's raw response, for transparency
 *   - disagreement: if any model deviated, a compact diff description
 *
 * Calls are parallelized. The cache is shared across the ensemble, so
 * if you ran a single-model extraction earlier, one of the ensemble calls
 * will be free.
 */

import type { ExtractRequest, ExtractResponse } from "./openrouter.js";
import { extractViaOpenRouter } from "./openrouter.js";

export interface EnsembleRequest extends Omit<ExtractRequest, "model"> {
  /** Two or more model names/aliases. */
  models: string[];
}

export interface EnsembleResponse {
  /** Consensus value — whichever raw value appeared in the most responses. */
  value: unknown;
  /** Fraction of models that agreed with the consensus, ∈ [0, 1]. */
  agreement: number;
  /** Per-model breakdown, in request order. */
  perModel: {
    model: string;
    response: ExtractResponse | null;
    error?: string;
  }[];
  /**
   * When agreement < 1, a short string describing the split — e.g.
   *   "2 of 3 models agree; gpt-5 returned a different value".
   */
  disagreement: string | null;
  /** Average confidence across successful calls. */
  meanConfidence: number | null;
  /** Max latency across models (parallel call ends when all finish). */
  latencyMs: number;
}

/**
 * Deep structural equality on unknowns. Enough for JSON-shaped values;
 * key order doesn't matter. We cap recursion; schema depths are small.
 */
function deepEqual(a: unknown, b: unknown, depth = 0): boolean {
  if (depth > 12) return a === b;
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++)
      if (!deepEqual(a[i], b[i], depth + 1)) return false;
    return true;
  }
  if (typeof a === "object") {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (
        !deepEqual(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
          depth + 1,
        )
      ) {
        return false;
      }
    }
    return true;
  }
  return false;
}

/**
 * Find the value that appears in the most responses and count its votes.
 */
function pluralityVote(
  values: unknown[],
): { winner: unknown; votes: number } | null {
  if (values.length === 0) return null;
  const tallies: { value: unknown; votes: number }[] = [];
  for (const v of values) {
    const hit = tallies.find((t) => deepEqual(t.value, v));
    if (hit) hit.votes++;
    else tallies.push({ value: v, votes: 1 });
  }
  tallies.sort((a, b) => b.votes - a.votes);
  return { winner: tallies[0]!.value, votes: tallies[0]!.votes };
}

export async function extractEnsemble(
  req: EnsembleRequest,
): Promise<EnsembleResponse> {
  if (req.models.length < 1) {
    throw new Error("extractEnsemble requires at least one model");
  }

  const started = Date.now();
  const perModel = await Promise.all(
    req.models.map(async (model) => {
      try {
        const { models: _m, ...rest } = req;
        const singleReq: ExtractRequest = { ...rest, model };
        const response = await extractViaOpenRouter(singleReq);
        return { model, response, error: undefined as string | undefined };
      } catch (e) {
        return {
          model,
          response: null,
          error: (e as Error).message,
        };
      }
    }),
  );
  const latencyMs = Date.now() - started;

  const successes = perModel.filter((p) => p.response !== null);
  if (successes.length === 0) {
    return {
      value: null,
      agreement: 0,
      perModel,
      disagreement: "all ensemble models failed",
      meanConfidence: null,
      latencyMs,
    };
  }

  const values = successes.map((p) => p.response!.value);
  const vote = pluralityVote(values)!;
  const agreement = vote.votes / successes.length;

  let disagreement: string | null = null;
  if (agreement < 1) {
    const losers = successes
      .filter((p) => !deepEqual(p.response!.value, vote.winner))
      .map((p) => p.model);
    disagreement = `${vote.votes} of ${successes.length} models agree; diverged: ${losers.join(", ")}`;
  }

  const confs = successes
    .map((p) => p.response!.confidence)
    .filter((c): c is number => c !== null);
  const meanConfidence =
    confs.length > 0 ? confs.reduce((a, b) => a + b, 0) / confs.length : null;

  return {
    value: vote.winner,
    agreement,
    perModel,
    disagreement,
    meanConfidence,
    latencyMs,
  };
}
