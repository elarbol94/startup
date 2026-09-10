"use server";

import { saveSchema, savePageContentInternal } from "./page-content-store";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, sqlite } from "@/db";
import { contextLinks, wikiPageEditLeases, wikiPages } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { indexText, removeFromIndex } from "./lib/vector-store.server";

import { slugify } from "./lib/tiptap";

function uniqueSlug(title: string, excludePageId?: string): string {
  const base = slugify(title);
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const exists = db
      .select({ id: wikiPages.id })
      .from(wikiPages)
      .where(eq(wikiPages.slug, slug))
      .get();
    if (!exists || exists.id === excludePageId) return slug;
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

const leaseSchema = z.object({
  pageId: z.string().min(1),
  sessionId: z.string().min(8).max(200),
  takeover: z.boolean().optional(),
});

const LEASE_TIMEOUT_MS = 60_000;

export async function acquirePageEditLease(input: z.infer<typeof leaseSchema>) {
  const currentUser = await requireUserOrThrow();
  const data = leaseSchema.parse(input);
  const now = new Date();
  const lease = db.select().from(wikiPageEditLeases).where(eq(wikiPageEditLeases.pageId, data.pageId)).get();
  const expired = !lease || now.getTime() - lease.heartbeatAt.getTime() > LEASE_TIMEOUT_MS;
  if (lease && !expired && lease.sessionId !== data.sessionId && !data.takeover) {
    return { editable: false as const, expiresAt: lease.heartbeatAt.getTime() + LEASE_TIMEOUT_MS };
  }
  db.insert(wikiPageEditLeases)
    .values({ pageId: data.pageId, sessionId: data.sessionId, userId: currentUser.id, acquiredAt: now, heartbeatAt: now })
    .onConflictDoUpdate({
      target: wikiPageEditLeases.pageId,
      set: { sessionId: data.sessionId, userId: currentUser.id, acquiredAt: now, heartbeatAt: now },
    })
    .run();
  return { editable: true as const, expiresAt: now.getTime() + LEASE_TIMEOUT_MS };
}

export async function heartbeatPageEditLease(input: Omit<z.infer<typeof leaseSchema>, "takeover">) {
  const currentUser = await requireUserOrThrow();
  const data = leaseSchema.omit({ takeover: true }).parse(input);
  const updated = db.update(wikiPageEditLeases)
    .set({ heartbeatAt: new Date() })
    .where(and(
      eq(wikiPageEditLeases.pageId, data.pageId),
      eq(wikiPageEditLeases.sessionId, data.sessionId),
      eq(wikiPageEditLeases.userId, currentUser.id),
    ))
    .returning({ pageId: wikiPageEditLeases.pageId })
    .get();
  return { editable: Boolean(updated) };
}

export async function releasePageEditLease(input: Omit<z.infer<typeof leaseSchema>, "takeover">) {
  const currentUser = await requireUserOrThrow();
  const data = leaseSchema.omit({ takeover: true }).parse(input);
  db.delete(wikiPageEditLeases).where(and(
    eq(wikiPageEditLeases.pageId, data.pageId),
    eq(wikiPageEditLeases.sessionId, data.sessionId),
    eq(wikiPageEditLeases.userId, currentUser.id),
  )).run();
  return { released: true as const };
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

const proofingLanguageSchema = z.object({
  pageId: z.string().min(1),
  language: z.enum(["de-DE", "de-AT", "en-US"]),
});

export async function updatePageProofingLanguage(input: z.infer<typeof proofingLanguageSchema>) {
  await requireUserOrThrow();
  const data = proofingLanguageSchema.parse(input);
  const result = db.update(wikiPages)
    .set({ proofingLanguage: data.language })
    .where(and(eq(wikiPages.id, data.pageId), isNull(wikiPages.deletedAt)))
    .returning({ proofingLanguage: wikiPages.proofingLanguage })
    .get();
  if (!result) throw new Error("Page not found");
  revalidatePath("/wiki", "layout");
  return result;
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

  const page = db.select().from(wikiPages).where(eq(wikiPages.id, id)).get();
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
  revalidatePath("/wiki", "layout");
  return { slug: nextSlug };
}

export async function savePageContent(input: z.infer<typeof saveSchema>) {
  return savePageContentInternal(input, await requireUserOrThrow());
}

export async function searchWiki(query: string) {
  await requireUserOrThrow();
  const { searchPages } = await import("./queries");
  return searchPages(z.string().max(200).parse(query));
}

/** Soft-deletes a page and all of its descendants. */
export async function deletePage(id: string) {
  const user = await requireUserOrThrow();

  const all = db
    .select({ id: wikiPages.id, parentId: wikiPages.parentId })
    .from(wikiPages)
    .where(isNull(wikiPages.deletedAt))
    .all();

  const childrenOf = new Map<string | null, string[]>();
  for (const page of all) {
    const list = childrenOf.get(page.parentId) ?? [];
    list.push(page.id);
    childrenOf.set(page.parentId, list);
  }

  const toDelete: string[] = [];
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    toDelete.push(current);
    queue.push(...(childrenOf.get(current) ?? []));
  }

  db.transaction(() => {
    db.delete(contextLinks)
      .where(
        and(
          eq(contextLinks.targetType, "wikiPage"),
          inArray(contextLinks.targetId, toDelete),
        ),
      )
      .run();
    db.update(wikiPages)
      .set({ deletedAt: new Date(), updatedBy: user.id })
      .where(inArray(wikiPages.id, toDelete))
      .run();
    for (const pageId of toDelete) {
      sqlite.prepare("DELETE FROM wiki_pages_fts WHERE page_id = ?").run(pageId);
      removeFromIndex("page", pageId);
    }
  });

  revalidatePath("/wiki", "layout");
}
