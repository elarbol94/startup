import "server-only";

import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import type { NetworkViewer } from "./access";
import { fail } from "./action-helpers";
import type { NetworkTranslate } from "./merge-fields";
import { normalizeText } from "./network-utils";
import {
  MAX_ORGANIZATION_NOTES,
  ORGANIZATION_MERGE_FIELDS,
  type NetworkOrganizationMergePreview,
  type OrganizationClash,
  type OrganizationMergeChoices,
  type OrganizationMergeConflict,
  type OrganizationMergeField,
  type OrganizationMergeFieldKey,
} from "./organization-merge-fields";
import { listNetworkOrganizations } from "./organization-queries";
import { networkContacts, networkLeads, networkOrganizations } from "./schema";

type OrganizationRow = typeof networkOrganizations.$inferSelect;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Database = Transaction | typeof db;

const fields: readonly OrganizationMergeField[] = ORGANIZATION_MERGE_FIELDS;
const isEmpty = (value: unknown) => value === null || value === undefined || (typeof value === "string" && !value.trim());
const fieldEmpty = (field: OrganizationMergeField, row: OrganizationRow) => field.columns.every((column) => isEmpty(row[column]));
const shown = (field: OrganizationMergeField, row: OrganizationRow) => String(row[field.columns[0]] ?? "");
const sameValue = (field: OrganizationMergeField, a: OrganizationRow, b: OrganizationRow) =>
  (field.identity ?? field.columns).every((column) => (a[column] ?? null) === (b[column] ?? null));

/**
 * Loads both organisations of a merge. The caller has checked for an admin:
 * organisations are shared and admins may merge any of them, so there is no
 * per-viewer check here.
 */
export function loadOrganizationPair(tx: Database, keepId: string, mergeId: string) {
  if (keepId === mergeId) return fail("invalid");
  const keep = tx.select().from(networkOrganizations).where(eq(networkOrganizations.id, keepId)).get();
  const merge = tx.select().from(networkOrganizations).where(eq(networkOrganizations.id, mergeId)).get();
  if (!keep || !merge) return fail("notFound");
  return { ok: true as const, keep, merge };
}

function organizationMergeConflicts(keep: OrganizationRow, merge: OrganizationRow): OrganizationMergeConflict[] {
  return fields
    .filter((field) => !fieldEmpty(field, keep) && !fieldEmpty(field, merge) && !sameValue(field, keep, merge))
    .map((field) => ({ key: field.key as OrganizationMergeFieldKey, keep: shown(field, keep), merge: shown(field, merge) }));
}

/**
 * Everything the merge writes onto the surviving organisation. Values not kept
 * go into the notes, except the name: the losing spelling is usually just a
 * variant of the same name, and the notes header names it anyway.
 */
export function planOrganizationMerge(keep: OrganizationRow, merge: OrganizationRow, choices: OrganizationMergeChoices, t: NetworkTranslate, today: string) {
  const values: Partial<OrganizationRow> = {};
  const discarded: string[] = [];
  for (const field of fields) {
    if (fieldEmpty(field, merge) || sameValue(field, keep, merge)) continue;
    const takeMerge = fieldEmpty(field, keep) || choices[field.key as OrganizationMergeFieldKey] === "merge";
    const loser = takeMerge ? keep : merge;
    if (takeMerge) for (const column of field.columns) Object.assign(values, { [column]: merge[column] });
    if (field.key !== "name" && !fieldEmpty(field, loser)) discarded.push(`${t(field.label)}: ${shown(field, loser)}`);
  }
  const name = values.name ?? keep.name;
  const mergeNotes = merge.notes.trim();
  const header = [t("merge.notesHeader", { name: merge.name, date: today }), discarded.join(", ")].filter(Boolean).join(" ");
  const notes = !discarded.length && !mergeNotes
    ? keep.notes
    : [keep.notes.trim(), [header, mergeNotes].filter(Boolean).join("\n")].filter(Boolean).join("\n\n");
  const blockers: NetworkOrganizationMergePreview["blockers"] = notes.length > MAX_ORGANIZATION_NOTES ? ["notesTooLong"] : [];
  return { values: { ...values, name, normalizedName: normalizeText(name), notes }, blockers };
}

const summary = (row: OrganizationRow): OrganizationClash => ({ id: row.id, name: row.name });

/**
 * What a merge would do. Counts every reference, other users' private contacts
 * included, but never names them. The notes limit is checked for the longest
 * possible outcome, so the action does not refuse a merge the preview allowed.
 */
export function organizationMergePreview(keep: OrganizationRow, merge: OrganizationRow, t: NetworkTranslate, today: string): NetworkOrganizationMergePreview {
  const conflicts = organizationMergeConflicts(keep, merge);
  const longest: OrganizationMergeChoices = Object.fromEntries(conflicts.map((conflict) => [
    conflict.key,
    // Keeping the shorter value discards the longer one into the notes.
    conflict.keep.length >= conflict.merge.length ? "merge" : "keep",
  ]));
  const plan = planOrganizationMerge(keep, merge, longest, t, today);
  const contacts = db.select({ n: count() }).from(networkContacts).where(eq(networkContacts.organizationId, merge.id)).get()?.n ?? 0;
  const leads = db.select({ n: count() }).from(networkLeads).where(eq(networkLeads.targetOrganizationId, merge.id)).get()?.n ?? 0;
  return {
    keep: summary(keep),
    merge: summary(merge),
    counts: { contacts, leads },
    conflicts,
    filled: fields.filter((field) => fieldEmpty(field, keep) && !fieldEmpty(field, merge)).map((field) => field.key as OrganizationMergeFieldKey),
    blockers: plan.blockers,
  };
}

/**
 * Moves every contact and lead from `merge` to `keep` (whoever owns them),
 * deletes `merge` and stores the merged values on `keep`, with the display
 * name copied onto contacts and leads. Must run inside the caller's transaction.
 */
export function applyOrganizationMerge(tx: Transaction, keepId: string, mergeId: string, values: ReturnType<typeof planOrganizationMerge>["values"]) {
  // Repointed before the delete, which would otherwise null the references.
  tx.update(networkContacts).set({ organizationId: keepId }).where(eq(networkContacts.organizationId, mergeId)).run();
  tx.update(networkLeads).set({ targetOrganizationId: keepId }).where(eq(networkLeads.targetOrganizationId, mergeId)).run();
  // Deleted before the update, so the survivor may take over the merged organisation's (unique) name.
  tx.delete(networkOrganizations).where(eq(networkOrganizations.id, mergeId)).run();
  tx.update(networkOrganizations).set({ ...values, updatedAt: new Date() }).where(eq(networkOrganizations.id, keepId)).run();
  const name = values.name;
  tx.update(networkContacts).set({ organization: name }).where(eq(networkContacts.organizationId, keepId)).run();
  tx.update(networkLeads).set({ targetOrganization: name }).where(eq(networkLeads.targetOrganizationId, keepId)).run();
}

/** Organisations an admin is offered to merge with `organizationId`: the ones they can see. */
export function listOrganizationMergeCandidates(viewer: NetworkViewer, organizationId: string): OrganizationClash[] {
  if (viewer.role !== "admin") return [];
  return listNetworkOrganizations(viewer)
    .filter((organization) => organization.id !== organizationId)
    .map((organization) => ({ id: organization.id, name: organization.name }));
}
