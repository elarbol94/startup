import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  requireUserOrThrow: vi.fn(async () => ({ id: "author", name: "Author", role: "admin" })),
  requireAdmin: vi.fn(async () => ({ id: "author", name: "Author", role: "admin" })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/files", () => ({ deleteAttachmentsFor: vi.fn(), UPLOADS_PATH: "/tmp/unused-uploads" }));
vi.mock("./lib/vector-store.server", () => ({ indexText: vi.fn(async () => {}), removeFromIndex: vi.fn() }));
vi.mock("@/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "drizzle" });
  sqlite.exec("INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role) VALUES ('author', 'Author', 'author@example.com', 1, 0, 0, 'admin')");
  return { sqlite, db };
});

import { sqlite } from "@/db";
import { requireAdmin, requireUserOrThrow } from "@/lib/auth";
import { removeFromIndex } from "./lib/vector-store.server";
import { createPage, deletePage, renamePage } from "./actions";
import { deletePages, movePages, setPagesStatus, updatePagesTags } from "./page-bulk-actions";
import { purgeTrashItems, restoreTrashItems } from "./trash-bulk-actions";
import { deleteSources } from "./source-bulk-actions";
import { purgeFromTrash } from "./research-actions";

type PageRow = { id: string; parent_id: string | null; sort_order: number; status: string; version: number; deleted_at: number | null; slug: string; updated_by: string };
const page = (id: string) => sqlite.prepare("SELECT * FROM wiki_pages WHERE id = ?").get(id) as PageRow | undefined;
const tagsOf = (id: string) => (sqlite.prepare("SELECT t.name FROM wiki_page_tags pt JOIN wiki_tags t ON t.id = pt.tag_id WHERE pt.page_id = ? ORDER BY t.name").all(id) as { name: string }[]).map((row) => row.name);
const ftsCount = (id: string) => (sqlite.prepare("SELECT count(*) AS n FROM wiki_pages_fts WHERE page_id = ?").get(id) as { n: number }).n;

async function make(title: string, parentId: string | null = null) {
  const { slug } = await createPage({ title, parentId, proofingLanguage: "de-AT" });
  return (sqlite.prepare("SELECT id FROM wiki_pages WHERE slug = ?").get(slug) as { id: string }).id;
}

beforeEach(() => {
  sqlite.exec("DELETE FROM wiki_page_tags; DELETE FROM wiki_tags; DELETE FROM wiki_pages; DELETE FROM wiki_pages_fts; DELETE FROM wiki_sources;");
  vi.mocked(removeFromIndex).mockClear();
});

describe("setPagesStatus", () => {
  it("updates live pages, skips unknown and trashed ones, and bumps the version", async () => {
    const a = await make("A");
    const b = await make("B");
    await deletePage(b);
    const before = page(a)!.version;
    const outcome = await setPagesStatus({ ids: [a, b, "missing"], status: "working" });
    expect(outcome.succeededIds).toEqual([a]);
    expect(outcome.skipped.map((item) => item.id)).toEqual([b, "missing"]);
    expect(page(a)).toMatchObject({ status: "working", version: before + 1 });
    expect(page(b)!.status).toBe("inbox");
  });
  it("counts pages already in the status as done without writing", async () => {
    const a = await make("A");
    const version = page(a)!.version;
    expect((await setPagesStatus({ ids: [a], status: "inbox" })).succeededIds).toEqual([a]);
    expect(page(a)!.version).toBe(version);
  });
  it("rejects empty and oversized batches", async () => {
    await expect(setPagesStatus({ ids: [], status: "working" })).rejects.toThrow();
    await expect(setPagesStatus({ ids: Array.from({ length: 501 }, (_, index) => `id-${index}`), status: "working" })).rejects.toThrow();
  });
});

describe("updatePagesTags", () => {
  it("adds and removes tags without touching the others", async () => {
    const a = await make("A");
    const b = await make("B");
    await updatePagesTags({ ids: [a, b], add: ["keep", "drop"] });
    await updatePagesTags({ ids: [a], add: ["extra"] });
    const drop = (sqlite.prepare("SELECT id FROM wiki_tags WHERE name = 'drop'").get() as { id: string }).id;
    await updatePagesTags({ ids: [a, b], add: ["New"], remove: [drop] });
    expect(tagsOf(a)).toEqual(["New", "extra", "keep"]);
    expect(tagsOf(b)).toEqual(["New", "keep"]);
  });
  it("creates a tag once, matching names case-insensitively", async () => {
    const a = await make("A");
    const b = await make("B");
    await updatePagesTags({ ids: [a], add: ["Topic"] });
    await updatePagesTags({ ids: [a, b], add: ["topic", "TOPIC"] });
    expect((sqlite.prepare("SELECT count(*) AS n FROM wiki_tags").get() as { n: number }).n).toBe(1);
    expect(tagsOf(b)).toEqual(["Topic"]);
  });
  it("skips pages that would exceed the tag limit", async () => {
    const a = await make("A");
    const b = await make("B");
    await updatePagesTags({ ids: [a], add: Array.from({ length: 20 }, (_, index) => `t${index}`) });
    const outcome = await updatePagesTags({ ids: [a, b], add: ["one-more"] });
    expect(outcome.succeededIds).toEqual([b]);
    expect(outcome.skipped).toEqual([{ id: a, reason: "tooManyTags" }]);
    expect(tagsOf(a)).not.toContain("one-more");
  });
  it("refuses an empty change", async () => {
    const a = await make("A");
    await expect(updatePagesTags({ ids: [a] })).rejects.toThrow();
  });
});

describe("movePages", () => {
  it("moves pages under a parent after its children, keeping slugs", async () => {
    const parent = await make("Parent");
    const existing = await make("Existing", parent);
    const a = await make("A");
    const b = await make("B");
    const slug = page(a)!.slug;
    await movePages({ ids: [b, a], parentId: parent });
    expect(page(a)).toMatchObject({ parent_id: parent, slug });
    expect(page(b)!.parent_id).toBe(parent);
    expect(page(a)!.sort_order).toBeGreaterThan(page(existing)!.sort_order);
    expect(page(b)!.sort_order).toBeGreaterThan(page(a)!.sort_order);
  });
  it("refuses cycles without writing anything", async () => {
    const a = await make("A");
    const child = await make("Child", a);
    const other = await make("Other");
    await expect(movePages({ ids: [a, other], parentId: child })).rejects.toThrow(/itself/);
    await expect(movePages({ ids: [a], parentId: a })).rejects.toThrow(/itself/);
    expect(page(other)!.parent_id).toBeNull();
    expect(page(a)!.parent_id).toBeNull();
  });
  it("keeps a selected child under its selected parent", async () => {
    const a = await make("A");
    const child = await make("Child", a);
    const target = await make("Target");
    const outcome = await movePages({ ids: [a, child], parentId: target });
    expect(page(a)!.parent_id).toBe(target);
    expect(page(child)!.parent_id).toBe(a);
    expect(outcome.succeededIds.sort()).toEqual([a, child].sort());
  });
  it("moves to the top level and refuses trashed parents", async () => {
    const a = await make("A");
    const child = await make("Child", a);
    await movePages({ ids: [child], parentId: null });
    expect(page(child)!.parent_id).toBeNull();
    const gone = await make("Gone");
    await deletePage(gone);
    await expect(movePages({ ids: [child], parentId: gone })).rejects.toThrow(/Parent/);
  });
});

describe("deletePages and trash", () => {
  it("trashes selected pages with their subtrees and drops them from search", async () => {
    const a = await make("A");
    const child = await make("Child", a);
    const grandchild = await make("Grandchild", child);
    const outcome = await deletePages({ ids: [a, grandchild] });
    expect(outcome.succeededIds.sort()).toEqual([a, grandchild].sort());
    expect(outcome.affectedIds.sort()).toEqual([a, child, grandchild].sort());
    for (const id of [a, child, grandchild]) {
      expect(page(id)!.deleted_at).not.toBeNull();
      expect(ftsCount(id)).toBe(0);
    }
    expect(removeFromIndex).toHaveBeenCalledTimes(3);
  });
  it("refuses metadata changes on trashed pages", async () => {
    const a = await make("A");
    await deletePage(a);
    await expect(renamePage(a, "New title")).rejects.toThrow(/not found/);
    expect((await setPagesStatus({ ids: [a], status: "working" })).skipped).toHaveLength(1);
  });
  it("restores selected pages and subpages together", async () => {
    const a = await make("A");
    const child = await make("Child", a);
    await deletePages({ ids: [a] });
    const outcome = await restoreTrashItems({ items: [{ type: "page", id: child }, { type: "page", id: a }] });
    expect(outcome.skipped).toEqual([]);
    expect(outcome.succeededIds.sort()).toEqual([`page:${a}`, `page:${child}`].sort());
    expect(page(a)!.deleted_at).toBeNull();
    expect(page(child)).toMatchObject({ deleted_at: null, parent_id: a });
    expect(ftsCount(child)).toBe(1);
  });
  it("lets ordinary users restore but only admins purge", async () => {
    const a = await make("A");
    await deletePage(a);
    vi.mocked(requireAdmin).mockRejectedValueOnce(new Error("Forbidden"));
    await expect(purgeTrashItems({ items: [{ type: "page", id: a }] })).rejects.toThrow("Forbidden");
    expect(page(a)).toBeDefined();
    vi.mocked(requireUserOrThrow).mockResolvedValueOnce({ id: "author", name: "Author", role: "user" } as Awaited<ReturnType<typeof requireUserOrThrow>>);
    expect((await restoreTrashItems({ items: [{ type: "page", id: a }] })).skipped).toEqual([]);
  });
  it("purges trashed subtrees and skips live pages", async () => {
    const a = await make("A");
    const child = await make("Child", a);
    const live = await make("Live");
    await deletePages({ ids: [a] });
    const outcome = await purgeTrashItems({ items: [{ type: "page", id: a }, { type: "page", id: child }, { type: "page", id: live }] });
    expect(outcome.succeededIds.sort()).toEqual([`page:${a}`, `page:${child}`].sort());
    expect(outcome.skipped).toEqual([{ id: `page:${live}`, reason: "notTrashed" }]);
    expect(page(a)).toBeUndefined();
    expect(page(child)).toBeUndefined();
    expect(page(live)).toBeDefined();
  });
  it("skips a trashed page with a live subpage but still purges a selected sibling", async () => {
    const a = await make("A");
    const other = await make("Other");
    await deletePages({ ids: [a, other] });
    sqlite.prepare("INSERT INTO wiki_pages (id, title, slug, parent_id, created_by, updated_by, created_at, updated_at) VALUES ('stale', 'Stale', 'stale', ?, 'author', 'author', 0, 0)").run(a);
    const outcome = await purgeTrashItems({ items: [{ type: "page", id: a }, { type: "page", id: other }] });
    expect(outcome.skipped).toEqual([{ id: `page:${a}`, reason: "blocked" }]);
    expect(page(other)).toBeUndefined();
  });
  it("skips pages whose document is open in the editor", async () => {
    const a = await make("A");
    await deletePage(a);
    sqlite.prepare("INSERT INTO wiki_office_sessions (key, page_id, base_version_id, state, opened_at, last_callback_at) VALUES ('k', ?, 'v', 'open', ?, ?)").run(a, Date.now(), Date.now());
    const outcome = await purgeTrashItems({ items: [{ type: "page", id: a }] });
    expect(outcome.skipped).toEqual([{ id: `page:${a}`, reason: "busy" }]);
    sqlite.prepare("UPDATE wiki_office_sessions SET state = 'idle'").run();
    expect((await purgeTrashItems({ items: [{ type: "page", id: a }] })).skipped).toEqual([]);
    expect(page(a)).toBeUndefined();
  });
  it("refuses to purge a live source", async () => {
    sqlite.prepare("INSERT INTO wiki_sources (id, type, title, created_by, updated_by, created_at, updated_at) VALUES ('s1', 'book', 'Live source', 'author', 'author', 0, 0)").run();
    await expect(purgeFromTrash("source", "s1")).rejects.toThrow(/trashed/);
    expect((await purgeTrashItems({ items: [{ type: "source", id: "s1" }] })).skipped).toEqual([{ id: "source:s1", reason: "notTrashed" }]);
    await deleteSources({ ids: ["s1"] });
    expect((await purgeTrashItems({ items: [{ type: "source", id: "s1" }] })).succeededIds).toEqual(["source:s1"]);
  });
});
