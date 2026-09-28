// Contact merge: the table of fields that can conflict, the input schema and
// the preview shape. No DB imports, so client components can use it.
import { z } from "zod";
import type { networkContacts } from "./schema";
import { idSchema } from "./validation";

type ContactRow = typeof networkContacts.$inferSelect;

export type MergeField = {
  key: string;
  /** Message key under `network` for the field's label. */
  label: string;
  /** Columns that move together; the first is the value shown to the user. */
  columns: readonly (keyof ContactRow)[];
  /** Columns that decide whether both sides hold the same value (default: all). */
  identity?: readonly (keyof ContactRow)[];
  /** How a stored value is shown: an enum translated via `network.<group>`, or a cadence in days. */
  display?: "relationships" | "closeness" | "reconnectDays";
};

/**
 * Single-value contact fields that can conflict when two contacts are merged:
 * set on both and different. The user picks one per field (default: the
 * surviving contact's value); a field set on one side only takes that value
 * automatically. The value not kept is written into the notes. New contact
 * columns that hold one value per person belong here, one line each.
 *
 * Not in this table on purpose: owner and visibility (the survivor keeps its
 * own; both must match anyway), notes (combined), last contact (the later
 * date), "not spoken yet" (derived, see `mergedNotYetSpoken`).
 */
export const MERGE_FIELDS = [
  { key: "name", label: "fields.name", columns: ["name"] },
  { key: "role", label: "fields.role", columns: ["role"] },
  { key: "email", label: "fields.email", columns: ["email"] },
  { key: "phone", label: "fields.phone", columns: ["phone"] },
  { key: "linkedinUrl", label: "fields.linkedinUrl", columns: ["linkedinUrl"] },
  { key: "metContext", label: "fields.metContext", columns: ["metContext"] },
  { key: "relationship", label: "fields.relationship", columns: ["relationship"], display: "relationships" },
  { key: "closeness", label: "fields.closeness", columns: ["closeness"], display: "closeness" },
  { key: "reconnectEveryDays", label: "reconnect.field", columns: ["reconnectEveryDays"], display: "reconnectDays" },
  { key: "organization", label: "fields.organization", columns: ["organization", "organizationId"] },
  { key: "municipality", label: "fields.municipality", columns: ["municipalityName", "municipalityCode"], identity: ["municipalityCode"] },
] as const satisfies readonly MergeField[];

export type MergeFieldKey = (typeof MERGE_FIELDS)[number]["key"];
export type MergeChoice = "keep" | "merge";
export type MergeChoices = Partial<Record<MergeFieldKey, MergeChoice>>;

/** Longest allowed contact notes, as in the edit form. */
export const MAX_CONTACT_NOTES = 20_000;

const choiceSchema = z.enum(["keep", "merge"]);
export const mergePairSchema = z.object({ keepId: idSchema, mergeId: idSchema });
export const mergeContactsSchema = mergePairSchema.extend({
  choices: z
    .object(Object.fromEntries(MERGE_FIELDS.map((field) => [field.key, choiceSchema.optional()])) as Record<MergeFieldKey, z.ZodOptional<typeof choiceSchema>>)
    .strict()
    .default({}),
});
export type MergeContactsInput = z.input<typeof mergeContactsSchema>;

/** A field set on both contacts with different values (the shown column's value). */
export type MergeConflict = { key: MergeFieldKey; keep: string; merge: string };

export type MergeContactSummary = { id: string; name: string; organization: string; visibility: "private" | "team" };

export type NetworkContactMergePreview = {
  keep: MergeContactSummary;
  merge: MergeContactSummary;
  /** What moves to the surviving contact. */
  counts: { leads: number; introductions: number; interactions: number; links: number; tags: number };
  conflicts: MergeConflict[];
  /** Fields empty on the surviving contact that take the other contact's value. */
  filled: MergeFieldKey[];
  /** Reasons the merge cannot go ahead until the user tidies up first. */
  blockers: ("notesTooLong" | "tooManyTags")[];
};

export const mergeFieldByKey = (key: MergeFieldKey): MergeField => MERGE_FIELDS.find((field) => field.key === key)!;

/** Message lookup under `network`. */
export type NetworkTranslate = (key: string, values?: Record<string, string | number>) => string;

/** A stored value as the user reads it, e.g. "friend" → "Freund:in", "90" → "Alle 90 Tage". */
export function formatMergeValue(t: NetworkTranslate, field: MergeField, value: string) {
  if (field.display === "reconnectDays") return t("reconnect.every", { days: Number(value) });
  if (field.display) return t(`${field.display}.${value}`);
  return value;
}

/**
 * "Not spoken yet" survives only when neither contact was spoken to: both
 * carry the flag and the merged contact has no last-contact date.
 */
export function mergedNotYetSpoken(keep: Pick<ContactRow, "notYetSpoken">, merge: Pick<ContactRow, "notYetSpoken">, lastContactOn: string | null) {
  return keep.notYetSpoken && merge.notYetSpoken && lastContactOn === null;
}
