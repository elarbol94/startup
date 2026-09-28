import fs from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

const uploads = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/office-convert-test-${process.pid}`;
  process.env.UPLOADS_PATH = dir;
  return dir;
});

vi.mock("server-only", () => ({}));
vi.mock("../lib/vector-store.server", () => ({ indexText: vi.fn(async () => {}), removeFromIndex: vi.fn() }));
vi.mock("../collaboration/live-registry", () => ({ freezeLiveDocument: vi.fn(() => null), pushToLiveDocument: vi.fn(), registerLiveBridge: vi.fn() }));
vi.mock("@/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "drizzle" });
  sqlite.exec("INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role) VALUES ('u1', 'Admin', 'a@example.com', 1, 0, 0, 'admin')");
  return { sqlite, db };
});

import { sqlite } from "@/db";
import { freezeLiveDocument } from "../collaboration/live-registry";
import { seedPage } from "../collaboration/codec";
import { convertPageToOffice, recoverInterruptedConversions } from "./convert-page";

afterAll(() => fs.rmSync(uploads, { recursive: true, force: true }));

const doc = (...content: object[]) => ({ type: "doc", content });
const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const row = <T>(sql: string, ...args: unknown[]) => sqlite.prepare(sql).get(...args) as T;

function page(id: string, body: object, withRoom = false) {
  sqlite.prepare("INSERT INTO wiki_pages (id, title, slug, content_json, document_mode, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 'u1', 'u1', 0, 0)")
    .run(id, `Seite ${id}`, id, JSON.stringify(body));
  if (withRoom) {
    const ydoc = new Y.Doc();
    seedPage(ydoc, body, true, {});
    sqlite.prepare("INSERT INTO wiki_collaboration_rooms (key, state, sequence) VALUES (?, ?, 1)").run(`page:${id}`, Buffer.from(Y.encodeStateAsUpdate(ydoc)));
    ydoc.destroy();
  }
}

beforeEach(() => {
  sqlite.exec("DELETE FROM wiki_office_versions; DELETE FROM wiki_office_sessions; DELETE FROM wiki_office_documents; DELETE FROM attachments; DELETE FROM wiki_collaboration_rooms; DELETE FROM wiki_page_revisions; DELETE FROM wiki_pages;");
  vi.mocked(freezeLiveDocument).mockReturnValue(null);
});

describe("convertPageToOffice", () => {
  it("converts the live room state, keeps the old body readable and drops the room", async () => {
    page("p1", doc(p("Gespeichert")), true);
    // Edits only held in memory by the live server are committed first.
    const live = new Y.Doc();
    seedPage(live, doc(p("Neuer Stand aus dem Speicher")), true, {});
    vi.mocked(freezeLiveDocument).mockReturnValue(Y.encodeStateAsUpdate(live));
    const result = await convertPageToOffice("p1", "u1", "https://app.example");
    expect(result).toMatchObject({ ok: true });
    expect(row<{ document_engine: string; content_text: string }>("SELECT document_engine, content_text FROM wiki_pages WHERE id = 'p1'")).toMatchObject({ document_engine: "office" });
    expect(row<{ content_text: string }>("SELECT content_text FROM wiki_pages WHERE id = 'p1'").content_text).toContain("Neuer Stand aus dem Speicher");
    expect(row<{ kind: string }>("SELECT kind FROM wiki_office_versions WHERE page_id = 'p1'").kind).toBe("conversion");
    expect(row<{ kind: string; content_json: string }>("SELECT kind, content_json FROM wiki_page_revisions WHERE page_id = 'p1'")).toMatchObject({ kind: "conversion" });
    expect(row("SELECT key FROM wiki_collaboration_rooms WHERE key = 'page:p1'")).toBeUndefined();
  });

  it("leaves pages it cannot convert faithfully in the old editor", async () => {
    page("p2", doc(p("Text"), { type: "horizontalRule" }));
    const result = await convertPageToOffice("p2", "u1", "https://app.example");
    expect(result).toMatchObject({ ok: false, reason: "notConvertible" });
    expect(row<{ document_engine: string; conversion_started_at: number | null }>("SELECT document_engine, conversion_started_at FROM wiki_pages WHERE id = 'p2'"))
      .toEqual({ document_engine: "tiptap", conversion_started_at: null });
    expect(row<{ n: number }>("SELECT count(*) AS n FROM wiki_office_versions").n).toBe(0);
  });

  it("converts code blocks line by line", async () => {
    page("p5", doc(p("Setup"), { type: "codeBlock", content: [{ type: "text", text: "npm install\nnpm run dev" }] }));
    expect(await convertPageToOffice("p5", "u1", "https://app.example")).toMatchObject({ ok: true });
  });

  it("refuses unresolved suggestions", async () => {
    page("p3", doc({ type: "paragraph", content: [{ type: "text", text: "neu", marks: [{ type: "suggestionInsert" }] }] }));
    expect(await convertPageToOffice("p3", "u1", "https://app.example")).toMatchObject({ ok: false, reason: "notConvertible" });
  });

  it("finishes or undoes conversions interrupted by a restart", async () => {
    page("done", doc(p("A")));
    await convertPageToOffice("done", "u1", "https://app.example");
    sqlite.prepare("UPDATE wiki_pages SET document_engine = 'converting' WHERE id = 'done'").run();
    page("halfway", doc(p("B")), true);
    sqlite.prepare("UPDATE wiki_pages SET document_engine = 'converting' WHERE id = 'halfway'").run();
    recoverInterruptedConversions();
    expect(row<{ document_engine: string }>("SELECT document_engine FROM wiki_pages WHERE id = 'done'").document_engine).toBe("office");
    expect(row<{ document_engine: string }>("SELECT document_engine FROM wiki_pages WHERE id = 'halfway'").document_engine).toBe("tiptap");
    expect(row("SELECT key FROM wiki_collaboration_rooms WHERE key = 'page:halfway'")).toBeDefined();
  });
});
