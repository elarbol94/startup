import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireUserOrThrow: vi.fn(async () => ({ id: "author", name: "Author" })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
import { createPage } from "./actions";
import { savePageContentInternal, type saveSchema } from "./page-content-store";
import type { z } from "zod";

const content = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
async function makePage({ title }: { title: string }) {
  const { slug } = await createPage({ title, parentId: null, proofingLanguage: "de-AT" });
  return sqlite.prepare("SELECT id FROM wiki_pages WHERE slug = ?").get(slug) as { id: string };
}
const sessionId = "editor-session-one";
const savePageContent = async (input: z.infer<typeof saveSchema>) => savePageContentInternal(input, { id: "author" });
const read = (id: string) => sqlite.prepare("SELECT content_json, content_version, document_mode FROM wiki_pages WHERE id = ?").get(id) as { content_json: string; content_version: number; document_mode: number };

beforeEach(() => { sqlite.exec("DELETE FROM wiki_pages"); });

describe("document save integrity", () => {
  it("acknowledges retries after a lost response without a conflict or another revision", async () => {
    const page = await makePage({ title: "Retries" });
    const input = { id: page.id, contentJson: content("Saved once"), expectedContentVersion: 1, editorSessionId: sessionId };
    const first = await savePageContent(input);
    expect(first).toMatchObject({ saved: true, contentVersion: 2 });
    expect(await savePageContent(input)).toEqual(first);
    expect(read(page.id).content_version).toBe(2);
  });
  it("preserves stale drafts as conflicts without replacing current content", async () => {
    const page = await makePage({ title: "Recovery" });
    await savePageContent({ id: page.id, contentJson: content("Current"), expectedContentVersion: 1, editorSessionId: sessionId });
    expect(await savePageContent({ id: page.id, contentJson: content("Stale"), expectedContentVersion: 1, editorSessionId: sessionId })).toMatchObject({ conflict: true });
    expect(read(page.id).content_json).toBe(content("Current"));
  });
  it.each(["null", "[]", '"text"', '{"type":"doc","content":[null]}', '{"type":"doc","content":"bad"}'])("rejects malformed content %s without modifying the page", async (contentJson) => {
    const page = await makePage({ title: "Validation" });
    const before = read(page.id);
    await expect(savePageContent({ id: page.id, contentJson, expectedContentVersion: 1, editorSessionId: sessionId })).rejects.toThrow();
    expect(read(page.id)).toEqual(before);
  });
  it("saves text even when a cited source has since been removed", async () => {
    const page = await makePage({ title: "Missing citation" });
    const contentJson = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "citation", attrs: { items: [{ sourceId: "deleted-source" }], label: "[1]" } }] }] });
    expect(await savePageContent({ id: page.id, contentJson, expectedContentVersion: 1, editorSessionId: sessionId })).toMatchObject({ saved: true });
    expect(read(page.id).content_json).toBe(contentJson);
  });
});
