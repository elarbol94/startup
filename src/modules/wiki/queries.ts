import { and, asc, eq, isNull } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { wikiLinks, wikiPages } from "@/db/schema";
import { buildFtsQuery } from "./lib/tiptap";

export type WikiTreeNode = {
  id: string;
  title: string;
  slug: string;
  parentId: string | null;
  icon: string | null;
  children: WikiTreeNode[];
};

export function getPageTree(): WikiTreeNode[] {
  const rows = db
    .select({
      id: wikiPages.id,
      title: wikiPages.title,
      slug: wikiPages.slug,
      parentId: wikiPages.parentId,
      icon: wikiPages.icon,
    })
    .from(wikiPages)
    .where(isNull(wikiPages.deletedAt))
    .orderBy(asc(wikiPages.sortOrder), asc(wikiPages.createdAt))
    .all();

  const nodes = new Map<string, WikiTreeNode>(
    rows.map((row) => [row.id, { ...row, children: [] }]),
  );
  const roots: WikiTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function getPageBySlug(slug: string) {
  return db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.slug, slug), isNull(wikiPages.deletedAt)))
    .get();
}

// Renaming a page moves its slug; the old one stays listed so links keep working.
export function getPageByPreviousSlug(slug: string) {
  // Slugs only ever contain [a-z0-9-]; anything else would smuggle LIKE wildcards into the lookup.
  if (!/^[a-z0-9-]+$/.test(slug)) return undefined;
  return sqlite
    .prepare(
      "SELECT id, slug FROM wiki_pages WHERE deleted_at IS NULL AND (',' || previous_slugs || ',') LIKE ? LIMIT 1",
    )
    .get(`%,${slug},%`) as { id: string; slug: string } | undefined;
}

/**
 * A slug is unavailable when another page (including trashed ones, which can be
 * restored) uses it now, or a live page used it before a rename: handing that old
 * slug to a new page would silently repoint existing links and bookmarks.
 */
export function isPageSlugTaken(slug: string, excludePageId?: string) {
  const current = db.select({ id: wikiPages.id }).from(wikiPages).where(eq(wikiPages.slug, slug)).get();
  if (current && current.id !== excludePageId) return true;
  const previous = getPageByPreviousSlug(slug);
  return Boolean(previous && previous.id !== excludePageId);
}

export function getBacklinks(pageId: string) {
  return db
    .select({
      id: wikiPages.id,
      title: wikiPages.title,
      slug: wikiPages.slug,
    })
    .from(wikiLinks)
    .innerJoin(wikiPages, eq(wikiLinks.sourcePageId, wikiPages.id))
    .where(and(eq(wikiLinks.targetPageId, pageId), isNull(wikiPages.deletedAt)))
    .all();
}

export type WikiSearchResult = {
  pageId: string;
  title: string;
  slug: string;
  snippet: string;
};

export function searchPages(query: string, limit = 10): WikiSearchResult[] {
  const ftsQuery = buildFtsQuery(query);
  if (!ftsQuery) return [];

  const rows = sqlite
    .prepare(
      `SELECT f.page_id AS pageId,
              p.title AS title,
              p.slug AS slug,
              snippet(wiki_pages_fts, 2, '<mark>', '</mark>', '…', 12) AS snippet
       FROM wiki_pages_fts f
       JOIN wiki_pages p ON p.id = f.page_id
       WHERE wiki_pages_fts MATCH ? AND p.deleted_at IS NULL
       ORDER BY rank
       LIMIT ?`,
    )
    .all(ftsQuery, limit) as WikiSearchResult[];

  return rows;
}

/** Pages whose body is TipTap JSON (office documents are excluded), e.g. presentation sources. */
export function listTiptapPagesFlat() {
  return db
    .select({ id: wikiPages.id, title: wikiPages.title, slug: wikiPages.slug })
    .from(wikiPages)
    .where(and(isNull(wikiPages.deletedAt), eq(wikiPages.documentEngine, "tiptap")))
    .orderBy(asc(wikiPages.title))
    .all();
}
