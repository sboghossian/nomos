/**
 * @nomos/llm — the LLM bridge runtime for Nomos.
 */

export {
  extractViaOpenRouter,
  resolveModel,
  MODEL_ALIASES,
  type ExtractRequest,
  type ExtractResponse,
} from "./openrouter.js";

export { buildTypeIndex, typeRefToSchema, type JsonSchema } from "./schema.js";

export {
  resolveFacts,
  type ResolveOptions,
  type ResolveResult,
  type FactMeta,
} from "./resolve.js";
