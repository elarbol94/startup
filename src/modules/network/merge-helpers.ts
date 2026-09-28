import "server-only";

import { and, count, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { canManageContact, visibleContactCondition, type NetworkViewer } from "./access";
import { contactFor, fail, removeUnusedTags } from "./action-helpers";
import {
  formatMergeValue,
  MAX_CONTACT_NOTES,
  MERGE_FIELDS,
  mergedNotYetSpoken,
  mergeFieldByKey,
  type MergeChoices,
  type MergeConflict,
  type MergeContactSummary,
  type MergeField,
  type MergeFieldKey,
  type NetworkContactMergePreview,
  type NetworkTranslate,
} from "./merge-fields";
import { MAX_TAGS_PER_CONTACT } from "./network-utils";
import { removeUnusedOrganizations } from "./organizations";
import { networkContactLinks, networkContacts, networkContactTags, networkInteractions, networkLeads } from "./schema";

type ContactRow = typeof networkContacts.$inferSelect;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Database = Transaction | typeof db;

const fields: readonly MergeField[] = MERGE_FIELDS;
const isEmpty = (value: unknown) => value === null || value === undefined || (typeof value === "string" && !value.trim());
const fieldEmpty = (field: MergeField, row: ContactRow) => field.columns.every((column) => isEmpty(row[column]));
const shown = (field: MergeField, row: ContactRow) => String(row[field.columns[0]] ?? "");
const sameValue = (field: MergeField, a: ContactRow, b: ContactRow) =>
  (field.identity ?? field.columns).every((column) => (a[column] ?? null) === (b[column] ?? null));

/**
 * Who may merge: the viewer must be allowed to manage both contacts, and both
 * must share their visibility (private contacts then share the owner too), so
 * a merge never changes who can see what. Nothing about either contact is
 * returned before this passes; one the viewer cannot see answers "notFound"
 * even when the other would only be "forbidden".
 */
export function authorizeMerge(keepId: string, mergeId: string, viewer: NetworkViewer) {
  if (keepId === mergeId) return fail("invalid");
  const keep = contactFor(keepId, viewer, "manage");
  const merge = contactFor(mergeId, viewer, "manage");
  if (!keep.ok && keep.error === "notFound") return keep;
  if (!merge.ok && merge.error === "notFound") return merge;
  if (!keep.ok) return keep;
  if (!merge.ok) return merge;
  const a = keep.contact;
  const b = merge.contact;
  if (a.visibility !== b.visibility || (a.visibility === "private" && a.ownerId !== b.ownerId)) return fail("visibilityMismatch");
  return { ok: true as const, keep: a, merge: b };
}

export function mergeConflicts(keep: ContactRow, merge: ContactRow): MergeConflict[] {
  return fields
    .filter((field) => !fieldEmpty(field, keep) && !fieldEmpty(field, merge) && !sameValue(field, keep, merge))
    .map((field) => ({ key: field.key as MergeFieldKey, keep: shown(field, keep), merge: shown(field, merge) }));
}

/** Column values the surviving contact takes over, and the values that lose out. */
function resolveScalars(keep: ContactRow, merge: ContactRow, choices: MergeChoices) {
  const values: Partial<ContactRow> = {};
  const discarded: { field: MergeField; value: string }[] = [];
  for (const field of fields) {
    if (fieldEmpty(field, merge) || sameValue(field, keep, merge)) continue;
    const takeMerge = fieldEmpty(field, keep) || choices[field.key as MergeFieldKey] === "merge";
    const loser = takeMerge ? keep : merge;
    if (takeMerge) for (const column of field.columns) Object.assign(values, { [column]: merge[column] });
    if (!fieldEmpty(field, loser)) discarded.push({ field, value: shown(field, loser) });
  }
  return { values, discarded };
}

/**
 * The surviving notes: its own, then "Merged from <name> on <date>:" with the
 * values that were not kept and the merged contact's notes, so nothing is lost.
 */
function combinedNotes(keep: ContactRow, merge: ContactRow, discarded: { field: MergeField; value: string }[], t: NetworkTranslate, mergedOn: string) {
  const mergeNotes = merge.notes.trim();
  if (!discarded.length && !mergeNotes) return keep.notes;
  const values = discarded.map(({ field, value }) => `${t(field.label)}: ${formatMergeValue(t, field, value)}`).join(", ");
  const header = [t("merge.notesHeader", { name: merge.name, date: mergedOn }), values].filter(Boolean).join(" ");
  return [keep.notes.trim(), [header, mergeNotes].filter(Boolean).join("\n")].filter(Boolean).join("\n\n");
}

const tagIdsOf = (tx: Database, contactId: string) =>
  tx.select({ id: networkContactTags.tagId }).from(networkContactTags).where(eq(networkContactTags.contactId, contactId)).all().map((row) => row.id);
const linkKey = (link: { targetType: string; targetId: string }) => `${link.targetType}:${link.targetId}`;
const linksOf = (tx: Database, contactId: string) => tx.select().from(networkContactLinks).where(eq(networkContactLinks.contactId, contactId)).all();

export type MergePlan = ReturnType<typeof planMerge>;

/** Everything the merge would write, computed the same way for the preview and the action. */
export function planMerge(tx: Database, keep: ContactRow, merge: ContactRow, choices: MergeChoices, t: NetworkTranslate, mergedOn: string) {
  const { values, discarded } = resolveScalars(keep, merge, choices);
  const notes = combinedNotes(keep, merge, discarded, t, mergedOn);
  const keepTags = new Set(tagIdsOf(tx, keep.id));
  const newTags = tagIdsOf(tx, merge.id).filter((id) => !keepTags.has(id));
  const keepLinks = new Set(linksOf(tx, keep.id).map(linkKey));
  const movingLinks = linksOf(tx, merge.id).filter((link) => !keepLinks.has(linkKey(link)));
  const blockers: NetworkContactMergePreview["blockers"] = [];
  if (notes.length > MAX_CONTACT_NOTES) blockers.push("notesTooLong");
  if (keepTags.size + newTags.length > MAX_TAGS_PER_CONTACT) blockers.push("tooManyTags");
  return { values, notes, newTags, movingLinks, blockers };
}

const summary = (row: ContactRow): MergeContactSummary => ({ id: row.id, name: row.name, organization: row.organization, visibility: row.visibility });

/**
 * What a merge would do. The notes limit is checked for the longest possible
 * outcome (every conflict discarding its longer value), so whatever the user
 * then picks, the action does not refuse a merge the preview allowed.
 */
export function mergePreview(viewer: NetworkViewer, keep: ContactRow, merge: ContactRow, t: NetworkTranslate, mergedOn: string): NetworkContactMergePreview {
  const conflicts = mergeConflicts(keep, merge);
  const longest: MergeChoices = Object.fromEntries(conflicts.map((conflict) => {
    const field = mergeFieldByKey(conflict.key);
    const length = (value: string) => formatMergeValue(t, field, value).length;
    // Keeping the shorter value discards the longer one into the notes.
    return [conflict.key, length(conflict.keep) >= length(conflict.merge) ? "merge" : "keep"];
  }));
  const plan = planMerge(db, keep, merge, longest, t, mergedOn);
  const leads = db.select({ n: count() }).from(networkLeads).where(eq(networkLeads.contactId, merge.id)).get()?.n ?? 0;
  const interactions = db.select({ n: count() }).from(networkInteractions).where(eq(networkInteractions.contactId, merge.id)).get()?.n ?? 0;
  // Introductions noted on other contacts: only those the viewer can see are counted (all of them move).
  const introductions = db
    .select({ n: count() })
    .from(networkLeads)
    .innerJoin(networkContacts, eq(networkContacts.id, networkLeads.contactId))
    .where(and(eq(networkLeads.targetContactId, merge.id), ne(networkLeads.contactId, merge.id), visibleContactCondition(viewer.id)))
    .get()?.n ?? 0;
  return {
    keep: summary(keep),
    merge: summary(merge),
    counts: { leads, introductions, interactions, links: plan.movingLinks.length, tags: plan.newTags.length },
    conflicts,
    filled: fields.filter((field) => fieldEmpty(field, keep) && !fieldEmpty(field, merge)).map((field) => field.key as MergeFieldKey),
    blockers: plan.blockers,
  };
}

/**
 * Moves everything from `merge` onto `keep` and deletes `merge`. Leads,
 * interactions and links keep their ids, authors, task links and timestamps.
 * Must run inside the caller's transaction.
 */
export function applyMerge(tx: Transaction, keep: ContactRow, merge: ContactRow, plan: MergePlan) {
  tx.update(networkLeads).set({ contactId: keep.id }).where(eq(networkLeads.contactId, merge.id)).run();
  tx.update(networkLeads).set({ targetContactId: keep.id }).where(eq(networkLeads.targetContactId, merge.id)).run();
  // "A introduces B" where A and B turned out to be one person, in either direction.
  tx.update(networkLeads).set({ targetContactId: null }).where(and(eq(networkLeads.contactId, keep.id), eq(networkLeads.targetContactId, keep.id))).run();
  tx.update(networkInteractions).set({ contactId: keep.id }).where(eq(networkInteractions.contactId, merge.id)).run();
  if (plan.movingLinks.length) {
    tx.update(networkContactLinks).set({ contactId: keep.id }).where(inArray(networkContactLinks.id, plan.movingLinks.map((link) => link.id))).run();
  }
  if (plan.newTags.length) {
    tx.insert(networkContactTags).values(plan.newTags.map((tagId) => ({ contactId: keep.id, tagId }))).onConflictDoNothing().run();
  }
  const lastContactOn = [keep.lastContactOn, merge.lastContactOn].filter((date): date is string => Boolean(date)).sort().at(-1) ?? null;
  tx.update(networkContacts)
    .set({
      ...plan.values,
      notes: plan.notes,
      lastContactOn,
      notYetSpoken: mergedNotYetSpoken(keep, merge, lastContactOn),
      externalCrmId: keep.externalCrmId ?? merge.externalCrmId,
      updatedAt: new Date(),
    })
    .where(eq(networkContacts.id, keep.id))
    .run();
  // Links left on `merge` duplicate ones on `keep`; deleting the contact cascades them and its tag rows.
  tx.delete(networkContacts).where(eq(networkContacts.id, merge.id)).run();
  removeUnusedTags(tx);
  removeUnusedOrganizations(tx);
}

/** Contacts the viewer could merge with `contact`: manageable, same visibility (and owner, if private). */
export function listMergeCandidates(contact: { id: string; ownerId: string; visibility: "private" | "team" }, viewer: NetworkViewer): MergeContactSummary[] {
  if (!canManageContact(contact, viewer)) return [];
  return db
    .select()
    .from(networkContacts)
    .where(and(visibleContactCondition(viewer.id), eq(networkContacts.visibility, contact.visibility), ne(networkContacts.id, contact.id)))
    .all()
    .filter((row) => canManageContact(row, viewer) && (row.visibility === "team" || row.ownerId === contact.ownerId))
    .map(summary)
    .sort((a, b) => a.name.localeCompare(b.name, "de") || a.id.localeCompare(b.id));
}
