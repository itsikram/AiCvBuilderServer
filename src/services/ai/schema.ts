import { z } from "zod";

/**
 * Tiny schema builder that produces a zod validator and the matching JSON Schema
 * (sent to Gemini as responseJsonSchema) from one definition, so they can't drift.
 * Only the subset Gemini's structured output supports is used.
 *
 * Limits (string length, array length, number range) are enforced here, not sent to
 * Gemini: nested array limits and number bounds multiply the states of Gemini's
 * constrained decoder, and a big schema such as the CV import is then refused with
 * "the specified schema produces a constraint that has too many states". So an
 * over-long answer is trimmed or clamped instead of rejected.
 */
export interface AiSchema<T> {
  zod: z.ZodType<T>;
  json: Record<string, unknown>;
}

const make = <T>(zod: z.ZodType<T>, json: Record<string, unknown>): AiSchema<T> => ({ zod, json });

// e.g. "O Positive (O+)" as a blood group is trimmed rather than failing the whole answer
export const S = {
  string: (description?: string, max = 4000) =>
    make(z.string().transform((value) => value.slice(0, max)), { type: "string", ...(description ? { description } : {}) }),

  /** Say the range in `description` (e.g. "0-100") so the model knows it. */
  number: (description?: string, min?: number, max?: number) => {
    const schema = z.number().transform((value) => Math.min(max ?? value, Math.max(min ?? value, value)));
    return make(schema, { type: "number", ...(description ? { description } : {}) });
  },

  enum: <const V extends readonly [string, ...string[]]>(values: V, description?: string) =>
    make(z.enum(values as unknown as [V[number], ...V[number][]]), {
      type: "string",
      enum: [...values],
      ...(description ? { description } : {}),
    }),

  array: <T>(item: AiSchema<T>, maxItems = 30, description?: string) =>
    make(z.array(item.zod).transform((items) => items.slice(0, maxItems)), {
      type: "array",
      items: item.json,
      ...(description ? { description } : {}),
    }),

  object: <Shape extends Record<string, AiSchema<unknown>>>(shape: Shape, description?: string) => {
    const zodShape = Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, value.zod])) as {
      [K in keyof Shape]: Shape[K]["zod"];
    };
    return make(z.object(zodShape) as unknown as z.ZodType<{ [K in keyof Shape]: z.infer<Shape[K]["zod"]> }>, {
      type: "object",
      properties: Object.fromEntries(Object.entries(shape).map(([key, value]) => [key, value.json])),
      required: Object.keys(shape),
      ...(description ? { description } : {}),
    });
  },
};

export type Infer<T> = T extends AiSchema<infer U> ? U : never;
