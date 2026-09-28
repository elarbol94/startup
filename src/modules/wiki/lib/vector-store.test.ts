import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const embed = vi.hoisted(() => ({ release: null as null | (() => void) }));
vi.mock("./embeddings.server", () => ({
  EMBEDDING_DIMENSIONS: 4,
  embedQuery: vi.fn(async () => null),
  // Resolves only when the test releases it, like a slow embedding model.
  embedPassages: vi.fn((texts: string[]) => new Promise((resolve) => {
    embed.release = () => resolve(texts.map(() => new Float32Array([0.1, 0.2, 0.3, 0.4])));
  })),
}));
vi.mock("@/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE wiki_pages (id TEXT PRIMARY KEY, deleted_at INTEGER);
    CREATE TABLE wiki_embeddings (id INTEGER PRIMARY KEY, kind TEXT, ref_id TEXT, page_number INTEGER, chunk_index INTEGER, content_hash TEXT, text TEXT, updated_at INTEGER, UNIQUE(kind, ref_id, page_number, chunk_index));
  `);
  return { sqlite, db: {} };
});

import { sqlite } from "@/db";
import { indexText, isVectorSearchAvailable } from "./vector-store.server";

const text = (topic: string) => `This is a meaningful paragraph about ${topic}, long enough to be embedded as one chunk of real prose.`;
const vectors = () => (sqlite.prepare("SELECT count(*) AS n FROM wiki_embeddings").get() as { n: number }).n;

beforeEach(() => {
  sqlite.exec("DELETE FROM wiki_pages; DELETE FROM wiki_embeddings; INSERT INTO wiki_pages (id) VALUES ('p1')");
});

describe.runIf(isVectorSearchAvailable())("page indexing and the trash", () => {
  it("indexes live pages", async () => {
    const pending = indexText({ kind: "page", refId: "p1", text: text("planning") });
    await vi.waitFor(() => expect(embed.release).not.toBeNull());
    embed.release!();
    await pending;
    expect(vectors()).toBeGreaterThan(0);
  });
  it("writes nothing when the page was trashed while embedding ran", async () => {
    embed.release = null;
    const pending = indexText({ kind: "page", refId: "p1", text: text("budgets") });
    await vi.waitFor(() => expect(embed.release).not.toBeNull());
    sqlite.prepare("UPDATE wiki_pages SET deleted_at = 1 WHERE id = 'p1'").run();
    embed.release!();
    expect(await pending).toBeNull();
    expect(vectors()).toBe(0);
  });
  it("skips trashed and purged pages up front", async () => {
    sqlite.prepare("UPDATE wiki_pages SET deleted_at = 1 WHERE id = 'p1'").run();
    expect(await indexText({ kind: "page", refId: "p1", text: "x" })).toBeNull();
    expect(await indexText({ kind: "page", refId: "gone", text: "x" })).toBeNull();
  });
});
