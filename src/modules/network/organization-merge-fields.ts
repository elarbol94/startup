// Organisation merge: the fields that can conflict, the input schema and the
// preview shape. No DB imports, so client components can use it.
import { z } from "zod";
import type { networkOrganizations } from "./schema";
import { idSchema } from "./validation";

type OrganizationRow = typeof networkOrganizations.$inferSelect;

export type OrganizationMergeField = {
  key: string;
  /** Message key under `network` for the field's label. */
  label: string;
  /** Columns that move together; the first is the value shown to the user. */
  columns: readonly (keyof OrganizationRow)[];
  /** Columns that decide whether both sides hold the same value (default: all). */
  identity?: readonly (keyof OrganizationRow)[];
};

/**
 * Organisation fields that can conflict: set on both and different. The admin
 * picks one per field (default: the surviving organisation's value); a field
 * set on one side only takes that value automatically; the value not kept is
 * written into the notes. Names always differ (they are unique), so the name
 * is always a choice. Notes are combined, never chosen.
 */
export const ORGANIZATION_MERGE_FIELDS = [
  { key: "name", label: "fields.name", columns: ["name"] },
  { key: "website", label: "fields.website", columns: ["website"] },
  { key: "municipality", label: "fields.organizationMunicipality", columns: ["municipalityName", "municipalityCode"], identity: ["municipalityCode"] },
] as const satisfies readonly OrganizationMergeField[];

export type OrganizationMergeFieldKey = (typeof ORGANIZATION_MERGE_FIELDS)[number]["key"];
export type OrganizationMergeChoice = "keep" | "merge";
export type OrganizationMergeChoices = Partial<Record<OrganizationMergeFieldKey, OrganizationMergeChoice>>;

/** Longest allowed organisation notes, as in the edit form. */
export const MAX_ORGANIZATION_NOTES = 20_000;

const choiceSchema = z.enum(["keep", "merge"]);
export const organizationMergePairSchema = z.object({ keepId: idSchema, mergeId: idSchema });
export const mergeOrganizationsSchema = organizationMergePairSchema.extend({
  choices: z
    .object({ name: choiceSchema.optional(), website: choiceSchema.optional(), municipality: choiceSchema.optional() })
    .strict()
    .default({}),
});
export type MergeOrganizationsInput = z.input<typeof mergeOrganizationsSchema>;

/** The organisation a rename clashed with. Only ever sent to admins. */
export type OrganizationClash = { id: string; name: string };

export type OrganizationMergeConflict = { key: OrganizationMergeFieldKey; keep: string; merge: string };

/**
 * What a merge would do. Counts only: the references include other users'
 * private contacts, whose names the admin must not see.
 */
export type NetworkOrganizationMergePreview = {
  keep: OrganizationClash;
  merge: OrganizationClash;
  /** Contacts working at and leads targeting the merged organisation; all of them move. */
  counts: { contacts: number; leads: number };
  conflicts: OrganizationMergeConflict[];
  /** Fields empty on the surviving organisation that take the other one's value. */
  filled: OrganizationMergeFieldKey[];
  blockers: "notesTooLong"[];
};

export const organizationMergeFieldByKey = (key: OrganizationMergeFieldKey): OrganizationMergeField =>
  ORGANIZATION_MERGE_FIELDS.find((field) => field.key === key)!;
