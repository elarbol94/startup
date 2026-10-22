// The stored form of a user-defined Kennzahl: the expression schema, its size limit, and
// serialising/parsing it. Used through kennzahlen.ts.
import { z } from "zod";
import {
  analysisBinaryOperatorIds,
  analysisUnaryOperatorIds,
  MAX_ANALYSIS_SHIFT_YEARS,
  municipalityDatasetRefSchema,
} from "./analysis";
import { unbindKennzahlInput, type KennzahlExpression } from "./kennzahlen-expression";

// --- persistence ------------------------------------------------------------

export const MAX_KENNZAHL_JSON_BYTES = 20_000;

/**
 * Validated against the dataset schema itself, by filling in a placeholder municipality —
 * so a Kennzahl input can never accept something a dataset node would reject, and unknown
 * keys are stripped rather than stored.
 */
const kennzahlInputSchema = z.looseObject({}).transform((value, context) => {
  const parsed = municipalityDatasetRefSchema.safeParse({
    ...value, municipalityCode: "00000", municipalityName: "Platzhalter",
  });
  const input = parsed.success ? unbindKennzahlInput(parsed.data) : null;
  if (!input) {
    context.addIssue({ code: "custom", message: "Unknown Ausgangsdatum in Kennzahl" });
    return z.NEVER;
  }
  return input;
});

export const kennzahlExpressionSchema: z.ZodType<KennzahlExpression> = z.lazy(() => z.union([
  z.object({ constant: z.number().finite() }),
  z.object({ input: kennzahlInputSchema }),
  z.object({ op: z.enum(analysisBinaryOperatorIds), a: kennzahlExpressionSchema, b: kennzahlExpressionSchema }),
  z.object({
    op: z.enum(analysisUnaryOperatorIds), a: kennzahlExpressionSchema,
    years: z.number().int().min(1).max(MAX_ANALYSIS_SHIFT_YEARS),
  }),
]));

export function serializeKennzahlExpression(expression: KennzahlExpression) {
  const json = JSON.stringify(kennzahlExpressionSchema.parse(expression));
  if (new TextEncoder().encode(json).byteLength > MAX_KENNZAHL_JSON_BYTES) {
    throw new Error("Kennzahl expression is too large");
  }
  return json;
}

export function parseKennzahlExpression(json: string) {
  if (new TextEncoder().encode(json).byteLength > MAX_KENNZAHL_JSON_BYTES) {
    throw new Error("Kennzahl expression is too large");
  }
  return kennzahlExpressionSchema.parse(JSON.parse(json));
}
