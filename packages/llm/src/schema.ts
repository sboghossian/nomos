/**
 * Nomos TypeRef → JSON Schema.
 *
 * OpenRouter's structured-output API (same shape as OpenAI's) expects a
 * JSON Schema. We derive one from the Nomos type the user asked to extract,
 * so the model returns data that matches the target type exactly.
 */

import type { Program, TypeRef, TypeDecl } from "@nomos/core";

export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: string[];
  description?: string;
  additionalProperties?: boolean;
}

/** Lookup table of type declarations by name. */
type TypeIndex = Map<string, TypeDecl>;

export function buildTypeIndex(program: Program): TypeIndex {
  const idx = new Map<string, TypeDecl>();
  for (const d of program.declarations) {
    if (d.kind === "TypeDecl") idx.set(d.name, d);
  }
  return idx;
}

/**
 * Convert a Nomos TypeRef into a JSON Schema fragment.
 * Primitive type names (String, Float, Int, Bool, Date, Duration, Geography)
 * map to their JSON equivalents. Named user types are expanded inline.
 */
export function typeRefToSchema(
  ref: TypeRef,
  types: TypeIndex,
  depth = 0,
): JsonSchema {
  if (depth > 8) return { type: "object", additionalProperties: true };

  switch (ref.kind) {
    case "UnionType":
      return { type: "string", enum: ref.variants };

    case "GenericType":
      if (ref.base === "List" || ref.base === "Array") {
        const arg = ref.args[0];
        return {
          type: "array",
          items: arg
            ? typeRefToSchema(arg, types, depth + 1)
            : { type: "object" },
        };
      }
      // Fallback: treat unknown generics as their first arg.
      return ref.args[0]
        ? typeRefToSchema(ref.args[0], types, depth + 1)
        : { type: "object" };

    case "NamedType":
      return namedTypeToSchema(ref.name, types, depth);
  }
}

function namedTypeToSchema(
  name: string,
  types: TypeIndex,
  depth: number,
): JsonSchema {
  // Primitives (case-insensitive, pragmatic).
  const lower = name.toLowerCase();
  if (lower === "string") return { type: "string" };
  if (lower === "float" || lower === "number") return { type: "number" };
  if (lower === "int" || lower === "integer") return { type: "integer" };
  if (lower === "bool" || lower === "boolean") return { type: "boolean" };
  if (lower === "date")
    return {
      type: "string",
      description: "ISO-8601 date (YYYY-MM-DD).",
    };
  if (lower === "duration")
    return {
      type: "number",
      description: "Duration in months (integer number of months).",
    };
  if (lower === "geography")
    return {
      type: "object",
      description:
        "A geographic scope. `reasonable` is a legal judgement about proportionality — true unless the scope is clearly over-broad for the function.",
      properties: {
        region: {
          type: "string",
          description:
            "Human-readable region name (e.g. 'Île-de-France', 'EU', 'worldwide').",
        },
        reasonable: {
          type: "boolean",
          description:
            "Whether the geographic scope is legally reasonable — proportionate to the employee's role and the employer's protectable interest.",
        },
      },
      required: ["region", "reasonable"],
      additionalProperties: false,
    };

  // User-declared type — expand inline.
  const decl = types.get(name);
  if (!decl) return { type: "object", additionalProperties: true };

  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const f of decl.fields) {
    properties[f.name] = typeRefToSchema(f.type, types, depth + 1);
    required.push(f.name);
  }
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}
