"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { wikiPages } from "@/db/schema";
import { requireAdmin, requireUserOrThrow } from "@/lib/auth";
import { MAX_BULK_IDS, type BulkOutcome, type BulkSkipReason } from "@/lib/bulk";
import { purgePageTree, purgeSource, restorePageTree, restoreSource, type PurgeResult, type RestoreResult } from "./page-trash";

const itemsSchema = z.object({
  items: z.array(z.object({ type: z.enum(["page", "source"]), id: z.string().min(1).max(128) })).min(1).max(MAX_BULK_IDS),
});

type TrashItem = { type: "page" | "source"; id: string };
const keyOf = (item: TrashItem) => `${item.type}:${item.id}`;

/** Selected pages in trash order: ancestors first, so their cascade runs before their subpages are tried. */
function pagesTopDown(ids: string[]) {
  const all = db.select({ id: wikiPages.id, parentId: wikiPages.parentId }).from(wikiPages).all();
  const parentOf = new Map(all.map((page) => [page.id, page.parentId]));
  const depth = (id: string) => { let value = 0; const seen = new Set([id]); let parent = parentOf.get(id); while (parent && !seen.has(parent)) { seen.add(parent); value += 1; parent = parentOf.get(parent); } return value; };
  return [...ids].sort((a, b) => depth(a) - depth(b));
}

/**
 * Runs `apply` for each item, pages top-down. A page already handled by an
 * ancestor's cascade counts as done; one whose ancestor was skipped is tried on
 * its own. Results use `type:id` keys because pages and sources mix here.
 */
async function forEachItem(items: TrashItem[], apply: (item: TrashItem) => Promise<{ result: RestoreResult | PurgeResult; cascaded?: string[] }>): Promise<BulkOutcome> {
  const unique = [...new Map(items.map((item) => [keyOf(item), item])).values()];
  const pageIds = pagesTopDown(unique.filter((item) => item.type === "page").map((item) => item.id));
  const ordered: TrashItem[] = [...pageIds.map((id) => ({ type: "page" as const, id })), ...unique.filter((item) => item.type === "source")];
  const handled = new Set<string>();
  const succeeded: string[] = [];
  const affected: string[] = [];
  const skipped: BulkOutcome["skipped"] = [];
  for (const item of ordered) {
    const key = keyOf(item);
    if (handled.has(key)) { succeeded.push(key); continue; }
    try {
      const { result, cascaded = [item.id] } = await apply(item);
      if (result === "ok") {
        succeeded.push(key);
        for (const id of cascaded) { handled.add(`${item.type}:${id}`); affected.push(`${item.type}:${id}`); }
      } else skipped.push({ id: key, reason: result as BulkSkipReason });
    } catch (error) {
      console.warn(JSON.stringify({ event: "trash_bulk_item_failed", key, reason: error instanceof Error ? error.message : "unknown" }));
      skipped.push({ id: key, reason: "blocked" });
    }
  }
  return { succeededIds: succeeded, affectedIds: affected, skipped };
}

export async function restoreTrashItems(input: z.input<typeof itemsSchema>): Promise<BulkOutcome> {
  const user = await requireUserOrThrow();
  const data = itemsSchema.parse(input);
  const outcome = await forEachItem(data.items, async (item) => {
    if (item.type === "source") return { result: restoreSource(item.id, user.id) };
    const { result, restoredIds } = restorePageTree(item.id, user.id);
    return { result, cascaded: restoredIds };
  });
  revalidatePath("/wiki", "layout");
  return outcome;
}

/**
 * Permanently deletes trashed items, each on its own: a blocked, busy or
 * failing item never stops the others.
 */
export async function purgeTrashItems(input: z.input<typeof itemsSchema>): Promise<BulkOutcome> {
  await requireAdmin();
  const data = itemsSchema.parse(input);
  const outcome = await forEachItem(data.items, async (item) => {
    if (item.type === "source") return { result: purgeSource(item.id) };
    const { result, purgedIds } = await purgePageTree(item.id);
    return { result, cascaded: purgedIds };
  });
  revalidatePath("/wiki", "layout");
  return outcome;
}
