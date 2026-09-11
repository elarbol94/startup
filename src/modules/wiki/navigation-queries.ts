import "server-only";
import { sqlite } from "@/db";
import { presentationRole } from "./presentation-access";

export type WikiNavigationItem = { id: string; title: string; href: string; kind: "document" | "source" | "presentation"; updatedAt: number };

export function resolveWikiNavigationPaths(viewer: { id: string; role?: string | null }, paths: string[]): WikiNavigationItem[] {
  return [...new Set(paths)].flatMap((path) => {
    const match = /^\/wiki\/(pages|sources|presentations)\/([^/?#]+)(?:\/[^?#]*)?$/.exec(path);
    if (!match) return [];
    const [, library, id] = match;
    const row = library === "pages"
      ? sqlite.prepare("SELECT id, title, updated_at AS updatedAt FROM wiki_pages WHERE slug = ? AND deleted_at IS NULL").get(id)
      : library === "sources"
        ? sqlite.prepare("SELECT id, title, updated_at AS updatedAt FROM wiki_sources WHERE id = ? AND deleted_at IS NULL").get(id)
        : presentationRole(id, viewer) ? sqlite.prepare("SELECT id, title, updated_at AS updatedAt FROM wiki_presentations WHERE id = ?").get(id) : null;
    return row ? [{ ...(row as { id: string; title: string; updatedAt: number }), href: `/wiki/${library}/${id}`, kind: library === "pages" ? "document" as const : library === "sources" ? "source" as const : "presentation" as const }] : [];
  }).filter((item, index, all) => all.findIndex((other) => other.href === item.href) === index);
}

// Metadata only: opening the switcher never loads presentation canvases or documents.
export function getWikiNavigationItems(viewer: { id: string; role?: string | null }, query = ""): WikiNavigationItem[] {
  const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
  const documents = sqlite.prepare("SELECT id, title, slug, updated_at AS updatedAt FROM wiki_pages WHERE deleted_at IS NULL AND title LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 60").all(pattern) as Array<{ id: string; title: string; slug: string; updatedAt: number }>;
  const sources = sqlite.prepare("SELECT id, title, updated_at AS updatedAt FROM wiki_sources WHERE deleted_at IS NULL AND title LIKE ? ESCAPE '\\' ORDER BY updated_at DESC LIMIT 60").all(pattern) as Array<{ id: string; title: string; updatedAt: number }>;
  const presentations = sqlite.prepare("SELECT id, title, updated_at AS updatedAt FROM wiki_presentations WHERE title LIKE ? ESCAPE '\\' ORDER BY updated_at DESC").all(pattern) as Array<{ id: string; title: string; updatedAt: number }>;
  return [
    ...documents.map((item): WikiNavigationItem => ({ ...item, kind: "document", href: `/wiki/pages/${item.slug}` })),
    ...sources.map((item): WikiNavigationItem => ({ ...item, kind: "source", href: `/wiki/sources/${item.id}` })),
    ...presentations.filter((item) => presentationRole(item.id, viewer)).slice(0, 60).map((item): WikiNavigationItem => ({ ...item, kind: "presentation", href: `/wiki/presentations/${item.id}` })),
  ].sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}

export type RecentlyOpenedItem = Omit<WikiNavigationItem, "kind"> & { kind: "document" | "pdf" | "presentation" };

export function resolveRecentlyOpenedPaths(viewer: { id: string; role?: string | null }, paths: string[]): RecentlyOpenedItem[] {
  const items: RecentlyOpenedItem[] = [];
  for (const path of [...new Set(paths)].slice(0, 30)) {
    const pdf = /^\/wiki\/sources\/([^/?#]+)\/read\/([^/?#]+)$/.exec(path);
    if (pdf) {
      const row = sqlite.prepare(`SELECT d.id, a.file_name AS title, d.updated_at AS updatedAt
        FROM wiki_pdf_documents d JOIN wiki_sources s ON s.id = d.source_id
        JOIN attachments a ON a.id = d.attachment_id
        WHERE d.id = ? AND d.source_id = ? AND s.deleted_at IS NULL`).get(pdf[2], pdf[1]) as { id: string; title: string; updatedAt: number } | undefined;
      if (row) items.push({ ...row, href: path, kind: "pdf" });
    } else if (/^\/wiki\/(pages|presentations)\/[^/?#]+(?:\/present)?$/.test(path)) {
      const item = resolveWikiNavigationPaths(viewer, [path])[0];
      if (item && item.kind !== "source") items.push({ ...item, kind: item.kind });
    }
  }
  return items.filter((item, index) => items.findIndex(other => other.href === item.href) === index);
}
