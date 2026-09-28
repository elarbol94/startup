"use server";

import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, sqlite } from "@/db";
import { wikiPages } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { indexText } from "./lib/vector-store.server";
import { softDeletePageTrees } from "./page-trash";

import { slugify } from "./lib/tiptap";
import { isPageSlugTaken } from "./queries";

function uniqueSlug(title: string, excludePageId?: string): string {
  const base = slugify(title);
  let slug = base;
  for (let i = 2; i < 100; i++) {
    if (!isPageSlugTaken(slug, excludePageId)) return slug;
    slug = `${base}-${i}`;
  }
  throw new Error("Could not allocate a unique slug");
}

/**
 * Embedding is slower than the rest of a save, so it runs after the transaction commits
 * and never blocks or fails it: a page that cannot be embedded is still saved, just not
 * semantically searchable until the next successful index.
 */
function scheduleIndex(pageId: string, title: string, contentText: string) {
  void indexText({ kind: "page", refId: pageId, text: `${title}\n\n${contentText}` })
    .catch((error: unknown) => console.warn(JSON.stringify({
      event: "page_index_failed", pageId, reason: error instanceof Error ? error.message : "unknown",
    })));
}

function syncFts(pageId: string, title: string, contentText: string) {
  sqlite
    .prepare("DELETE FROM wiki_pages_fts WHERE page_id = ?")
    .run(pageId);
  sqlite
    .prepare(
      "INSERT INTO wiki_pages_fts (page_id, title, content_text) VALUES (?, ?, ?)",
    )
    .run(pageId, title, contentText);
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  parentId: z.string().nullable().default(null),
  proofingLanguage: z.enum(["de-DE", "de-AT", "en-US"]).default("de-DE"),
});

export async function createPage(
  input: z.infer<typeof createSchema>,
): Promise<{ slug: string }> {
  const user = await requireUserOrThrow();
  const data = createSchema.parse(input);
  if (data.parentId && !db.select({ id: wikiPages.id }).from(wikiPages).where(and(eq(wikiPages.id, data.parentId), isNull(wikiPages.deletedAt))).get()) {
    throw new Error("Parent page not found");
  }

  const slug = uniqueSlug(data.title);
  const row = db
    .insert(wikiPages)
    .values({
      title: data.title,
      slug,
      parentId: data.parentId,
      proofingLanguage: data.proofingLanguage,
      createdBy: user.id,
      updatedBy: user.id,
    })
    .returning({ id: wikiPages.id })
    .get();

  syncFts(row.id, data.title, "");
  scheduleIndex(row.id, data.title, "");
  revalidatePath("/wiki", "layout");
  return { slug };
}

/**
 * Persists sibling order. sortOrder had no writer at all, so the page tree always fell
 * through to createdAt. Reordering is scoped to one parent: every id must already be a
 * child of it, which keeps a stale client from silently reparenting pages.
 */
export async function reorderPages(input: { parentId: string | null; orderedIds: string[] }) {
  const user = await requireUserOrThrow();
  const data = z.object({
    parentId: z.string().min(1).nullable(),
    orderedIds: z.array(z.string().min(1)).min(1).max(500),
  }).parse(input);

  const siblings = db
    .select({ id: wikiPages.id, parentId: wikiPages.parentId })
    .from(wikiPages)
    .where(and(inArray(wikiPages.id, data.orderedIds), isNull(wikiPages.deletedAt)))
    .all();
  if (siblings.length !== data.orderedIds.length) throw new Error("Page not found");
  if (siblings.some((page) => (page.parentId ?? null) !== data.parentId)) {
    throw new Error("Pages do not share the given parent");
  }

  db.transaction(() => {
    data.orderedIds.forEach((id, index) => {
      db.update(wikiPages)
        .set({ sortOrder: index, updatedBy: user.id, updatedAt: new Date() })
        .where(eq(wikiPages.id, id))
        .run();
    });
  });
  revalidatePath("/wiki", "layout");
}

export async function renamePage(id: string, title: string) {
  const user = await requireUserOrThrow();
  const cleanTitle = z.string().min(1).max(200).parse(title);

  const page = db.select().from(wikiPages).where(and(eq(wikiPages.id, id), isNull(wikiPages.deletedAt))).get();
  if (!page) throw new Error("Page not found");

  // Keep the URL in step with the title, but remember the old slug so existing links
  // (in other pages' content, bookmarks, chat messages) still resolve.
  const nextSlug = uniqueSlug(cleanTitle, id);
  const slugChanged = nextSlug !== page.slug;
  const previousSlugs = slugChanged
    ? [...page.previousSlugs.split(",").filter((slug) => slug && slug !== nextSlug), page.slug].join(",")
    : page.previousSlugs;

  db.transaction(() => {
    db.update(wikiPages)
      .set({ title: cleanTitle, slug: nextSlug, previousSlugs, updatedBy: user.id, updatedAt: new Date(), version: page.version + 1 })
      .where(eq(wikiPages.id, id))
      .run();
  });
  syncFts(id, cleanTitle, page.contentText);
  scheduleIndex(id, cleanTitle, page.contentText);
  // No revalidatePath here: it would re-render the old URL inside the action response,
  // whose redirect to the new slug remounts the open editor. The caller refreshes instead.
  return { slug: nextSlug };
}

/** Soft-deletes a page and all of its descendants. */
export async function deletePage(id: string) {
  const user = await requireUserOrThrow();
  softDeletePageTrees([z.string().min(1).parse(id)], user.id);
  revalidatePath("/wiki", "layout");
}
