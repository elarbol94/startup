import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireUserOrThrow: vi.fn(async () => ({ id: "a", name: "Alice" })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../lib/vector-store.server", () => ({ indexText: vi.fn(async () => {}), removeFromIndex: vi.fn() }));
vi.mock("@/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(":memory:"); sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite); migrate(db, { migrationsFolder: "drizzle" });
  for (const id of ["a", "b", "c"]) sqlite.prepare("INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role) VALUES (?, ?, ?, 1, 0, 0, 'member')").run(id, id, `${id}@example.com`);
  return { sqlite, db };
});
import { sqlite } from "@/db";
import { createPage, savePageContent } from "../actions";
import { createPresentation, savePresentation } from "../presentation-actions";
import { applyRoomUpdate, authorize, loadRoom, replayRoom, roomExists } from "./store";
import { documentJSON, encode, presentationJSON, patchPresentation } from "./codec";
const viewer = { id: "a", name: "Alice" };
const clone = (state: Uint8Array) => { const doc = new Y.Doc(); Y.applyUpdate(doc, state); return doc; };
async function page() { const { slug } = await createPage({ title: "Shared", parentId: null, proofingLanguage: "de-AT" }); return (sqlite.prepare("SELECT id FROM wiki_pages WHERE slug = ?").get(slug) as { id: string }).id; }
beforeEach(() => { sqlite.exec("DELETE FROM wiki_collaboration_rooms; DELETE FROM wiki_pages; DELETE FROM wiki_presentations; UPDATE user SET removedAt = NULL, banned = 0"); });
describe("durable collaboration", () => {
  it("initializes exactly once, persists three writers and rejects legacy snapshots", async () => {
    const id = await page(); const room = loadRoom("page", id); expect(loadRoom("page", id).state).toEqual(room.state);
    for (const userId of ["a", "b", "c"]) {
      const doc = clone(room.state); const paragraph = doc.getXmlFragment("body").get(0) as Y.XmlElement;
      const text = new Y.XmlText(); paragraph.insert(0, [text]); text.insert(0, `writer-${userId}`);
      applyRoomUpdate("page", id, encode(Y.encodeStateAsUpdate(doc)), { id: userId });
    }
    const stored = loadRoom("page", id); const result = JSON.stringify(documentJSON(clone(stored.state)));
    for (const id of ["a", "b", "c"]) expect(result).toContain(`writer-${id}`);
    expect(stored.sequence).toBe(3);
    const row = sqlite.prepare("SELECT content_json FROM wiki_pages WHERE id = ?").get(id) as { content_json: string };
    expect(JSON.parse(row.content_json)).toEqual(documentJSON(clone(stored.state)));
    await expect(savePageContent({ id, contentJson: '{"type":"doc","content":[]}', expectedContentVersion: 1, editorSessionId: "old-browser-tab" })).rejects.toThrow("Reload");
  });
  it("acknowledges duplicate delivery without creating revisions and can replay from a compacted snapshot", async () => {
    const id = await page(); const room = loadRoom("page", id); const doc = clone(room.state);
    doc.getMap("layout").set("documentMode", true); const update = encode(Y.encodeStateAsUpdate(doc));
    const first = applyRoomUpdate("page", id, update, viewer);
    expect(applyRoomUpdate("page", id, update, viewer).sequence).toBe(first.sequence);
    sqlite.prepare("DELETE FROM wiki_collaboration_updates WHERE room = ?").run(room.key);
    const replay = replayRoom("page", id, 0)!;
    expect(replay.sequence).toBe(first.sequence); expect(replay.update).toBe(encode(first.state));
  });
  it("rejects invalid updates transactionally and denies removed users and deleted pages", async () => {
    const id = await page(); const before = loadRoom("page", id); const doc = clone(before.state);
    doc.getMap("layout").set("documentMode", "invalid");
    expect(() => applyRoomUpdate("page", id, encode(Y.encodeStateAsUpdate(doc)), viewer)).toThrow();
    expect(loadRoom("page", id)).toEqual(before);
    sqlite.prepare("UPDATE user SET removedAt = 1 WHERE id = 'b'").run();
    expect(() => authorize("page", id, { id: "b" })).toThrow();
    expect(() => authorize("page", id, viewer, "expired-session")).toThrow();
    sqlite.prepare("UPDATE wiki_pages SET deleted_at = 1 WHERE id = ?").run(id);
    expect(() => applyRoomUpdate("page", id, encode(Y.encodeStateAsUpdate(doc)), viewer)).toThrow();
  });
  it("projects shared presentation changes and denies viewers access to raw state", async () => {
    const { id } = await createPresentation({ title: "Shared", templateId: "pitch" });
    const room = loadRoom("presentation", id); const doc = clone(room.state); const before = presentationJSON(doc);
    patchPresentation(doc, before, { ...before, title: "Together" });
    applyRoomUpdate("presentation", id, encode(Y.encodeStateAsUpdate(doc)), viewer);
    expect((sqlite.prepare("SELECT title FROM wiki_presentations WHERE id = ?").get(id) as { title: string }).title).toBe("Together");
    sqlite.prepare("INSERT INTO wiki_presentation_members (id, presentation_id, user_id, role) VALUES ('membership', ?, 'b', 'view')").run(id);
    expect(() => authorize("presentation", id, { id: "b" })).toThrow();
    expect(roomExists("presentation", id)).toBe(true);
    await expect(savePresentation({ id, elements: [], steps: [] })).rejects.toThrow("Reload");
  });
});
