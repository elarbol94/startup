"use server";

import { z } from "zod";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { wikiPages, wikiPageStatuses, wikiPageTags } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { bulkIdsSchema, bulkOutcome, type BulkOutcome } from "@/lib/bulk";
import { buildPageTree, descendantIds, topmostSelected } from "./lib/page-tree";
import { softDeletePageTrees } from "./page-trash";
import { ensureTags } from "./source-records";

/** Same limit as the page metadata form. */
const MAX_TAGS_PER_PAGE = 20;

function revalidateWiki() {
  revalidatePath("/wiki", "layout");
}

function livePages(ids: string[]) {
  return db.select({ id: wikiPages.id, status: wikiPages.status }).from(wikiPages)
    .where(and(inArray(wikiPages.id, ids), isNull(wikiPages.deletedAt))).all();
}

const touched = (userId: string) => ({ updatedBy: userId, updatedAt: new Date(), version: sql`${wikiPages.version} + 1` });

const statusSchema = z.object({ ids: bulkIdsSchema, status: z.enum(wikiPageStatuses) });

/** Sets the status of live pages. Pages already in that status count as done. */
export async function setPagesStatus(input: z.input<typeof statusSchema>): Promise<BulkOutcome> {
  const user = await requireUserOrThrow();
  const data = statusSchema.parse(input);
  const outcome = db.transaction(() => {
    const pages = livePages(data.ids);
    const found = new Set(pages.map((page) => page.id));
    const changed = pages.filter((page) => page.status !== data.status).map((page) => page.id);
    if (changed.length) db.update(wikiPages).set({ status: data.status, ...touched(user.id) }).where(inArray(wikiPages.id, changed)).run();
    return bulkOutcome(data.ids.filter((id) => found.has(id)), data.ids.filter((id) => !found.has(id)).map((id) => ({ id, reason: "notFound" as const })));
  });
  revalidateWiki();
  return outcome;
}

const tagsSchema = z.object({
  ids: bulkIdsSchema,
  add: z.array(z.string().trim().min(1).max(40)).max(MAX_TAGS_PER_PAGE).default([]),
  remove: z.array(z.string().min(1).max(128)).max(100).default([]),
}).refine((data) => data.add.length + data.remove.length > 0, { message: "Nothing to change" });

/**
 * Adds tags (by name, created when missing) and removes tags (by id) on each page,
 * leaving its other tags alone. A tag both added and removed is added.
 */
export async function updatePagesTags(input: z.input<typeof tagsSchema>): Promise<BulkOutcome> {
  const user = await requireUserOrThrow();
  const data = tagsSchema.parse(input);
  const outcome = db.transaction(() => {
    const pages = livePages(data.ids);
    const found = new Set(pages.map((page) => page.id));
    const skipped: BulkOutcome["skipped"] = data.ids.filter((id) => !found.has(id)).map((id) => ({ id, reason: "notFound" }));
    if (pages.length === 0) return bulkOutcome([], skipped);
    const addIds = [...new Set(ensureTags(data.add, user.id).map((tag) => tag.id))];
    const remove = new Set(data.remove.filter((id) => !addIds.includes(id)));
    const current = new Map<string, Set<string>>(pages.map((page) => [page.id, new Set()]));
    for (const row of db.select().from(wikiPageTags).where(inArray(wikiPageTags.pageId, pages.map((page) => page.id))).all()) current.get(row.pageId)?.add(row.tagId);
    const succeeded: string[] = [];
    for (const page of pages) {
      const tags = current.get(page.id)!;
      const toAdd = addIds.filter((id) => !tags.has(id));
      const toRemove = [...tags].filter((id) => remove.has(id));
      if (tags.size + toAdd.length - toRemove.length > MAX_TAGS_PER_PAGE) {
        skipped.push({ id: page.id, reason: "tooManyTags" });
        continue;
      }
      succeeded.push(page.id);
      if (!toAdd.length && !toRemove.length) continue;
      if (toRemove.length) db.delete(wikiPageTags).where(and(eq(wikiPageTags.pageId, page.id), inArray(wikiPageTags.tagId, toRemove))).run();
      if (toAdd.length) db.insert(wikiPageTags).values(toAdd.map((tagId) => ({ pageId: page.id, tagId }))).onConflictDoNothing().run();
      db.update(wikiPages).set(touched(user.id)).where(eq(wikiPages.id, page.id)).run();
    }
    return bulkOutcome(data.ids.filter((id) => succeeded.includes(id)), skipped);
  });
  revalidateWiki();
  return outcome;
}

const moveSchema = z.object({ ids: bulkIdsSchema, parentId: z.string().min(1).max(128).nullable() });

/**
 * Moves pages (with their subpages) under `parentId`, or to the top level. Moving
 * a page into itself or below one of its own subpages refuses the whole request.
 * Moved pages go after the target's existing children, in their current order.
 */
export async function movePages(input: z.input<typeof moveSchema>): Promise<BulkOutcome> {
  const user = await requireUserOrThrow();
  const data = moveSchema.parse(input);
  const outcome = db.transaction(() => {
    const live = db.select({ id: wikiPages.id, parentId: wikiPages.parentId, sortOrder: wikiPages.sortOrder, createdAt: wikiPages.createdAt })
      .from(wikiPages).where(isNull(wikiPages.deletedAt)).all()
      .map((page) => ({ ...page, createdAt: page.createdAt.getTime() }));
    const liveIds = new Set(live.map((page) => page.id));
    if (data.parentId && !liveIds.has(data.parentId)) throw new Error("Parent page not found");
    const requested = data.ids.filter((id) => liveIds.has(id));
    if (data.parentId && descendantIds(live, requested).has(data.parentId)) throw new Error("A page cannot be moved into itself or its subpages");
    const roots = new Set(topmostSelected(live, requested));
    const moving = buildPageTree(live).filter((page) => roots.has(page.id) && (page.parentId ?? null) !== data.parentId);
    let next = Math.max(-1, ...live.filter((page) => (page.parentId ?? null) === data.parentId).map((page) => page.sortOrder)) + 1;
    for (const page of moving) {
      db.update(wikiPages).set({ parentId: data.parentId, sortOrder: next++, ...touched(user.id) }).where(eq(wikiPages.id, page.id)).run();
    }
    const skipped = data.ids.filter((id) => !liveIds.has(id)).map((id) => ({ id, reason: "notFound" as const }));
    return bulkOutcome(requested, skipped, [...descendantIds(live, roots)]);
  });
  revalidateWiki();
  return outcome;
}

const deleteSchema = z.object({ ids: bulkIdsSchema });

/** Moves pages and all their subpages to the trash. */
export async function deletePages(input: z.input<typeof deleteSchema>): Promise<BulkOutcome> {
  const user = await requireUserOrThrow();
  const data = deleteSchema.parse(input);
  const live = db.select({ id: wikiPages.id, parentId: wikiPages.parentId }).from(wikiPages).where(isNull(wikiPages.deletedAt)).all();
  const liveIds = new Set(live.map((page) => page.id));
  const requested = data.ids.filter((id) => liveIds.has(id));
  const affected = softDeletePageTrees(topmostSelected(live, requested), user.id);
  const trashed = new Set(affected);
  const outcome = bulkOutcome(
    requested.filter((id) => trashed.has(id)),
    data.ids.filter((id) => !trashed.has(id)).map((id) => ({ id, reason: "notFound" as const })),
    affected,
  );
  revalidateWiki();
  return outcome;
}
