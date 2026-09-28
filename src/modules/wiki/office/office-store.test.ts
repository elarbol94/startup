import fs from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const uploads = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? "/tmp"}/office-store-test-${process.pid}`;
  process.env.UPLOADS_PATH = dir;
  process.env.BETTER_AUTH_SECRET = "test-secret-with-enough-length-0123456789";
  return dir;
});

vi.mock("../lib/vector-store.server", () => ({ indexText: vi.fn(async () => {}), removeFromIndex: vi.fn() }));
vi.mock("@/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "drizzle" });
  sqlite.exec("INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role) VALUES ('u1', 'User One', 'u1@example.com', 1, 0, 0, 'admin'), ('u2', 'User Two', 'u2@example.com', 1, 0, 0, 'member')");
  return { sqlite, db };
});

import { sqlite } from "@/db";
import fixtures from "./__fixtures__/callbacks-9.4.json";
import { handleCallback, type CallbackPayload } from "./callback";
import { createOfficePage } from "./create";
import { recoverOfficeOperations, runRestore, startCheckpoint, startRestore, type OperationDeps } from "./operations";
import { getOrOpenSession, OfficeConflictError } from "./sessions";
import { commitCallbackSave, prepareDocx, readVersionFile } from "./store";
import { para, testDocx } from "./test-docx";
import { savePageContentInternal } from "../page-content-store";
import { authorize } from "../collaboration/store";

afterAll(() => fs.rmSync(uploads, { recursive: true, force: true }));

const docx = (text: string, extra = "") => testDocx(para(text) + extra);
const row = <T>(query: string, ...args: unknown[]) => sqlite.prepare(query).get(...args) as T;
const rows = <T>(query: string, ...args: unknown[]) => sqlite.prepare(query).all(...args) as T[];
const head = (pageId: string) => row<{ id: string; kind: string; version: number; session_key: string | null }>(
  "SELECT v.id, v.kind, v.version, v.session_key FROM wiki_office_documents d JOIN wiki_office_versions v ON v.id = d.head_version_id WHERE d.page_id = ?", pageId);
const headText = (pageId: string) => row<{ content_text: string }>("SELECT content_text FROM wiki_pages WHERE id = ?", pageId).content_text;

async function newPage(title = "Plan") {
  return createOfficePage({ title, parentId: null, locale: "de", prepared: prepareDocx(docx(`${title} v1`)), kind: "create", userId: "u1" });
}

/** Simulated document server: callbacks carry a URL; the download returns what was "saved". */
function server() {
  const files = new Map<string, Buffer>();
  let counter = 0;
  const saved = (text: string, extra = "") => { const url = `http://public.example/office/cache/files/data/f${++counter}/output.docx`; files.set(url, docx(text, extra)); return url; };
  return { saved, deps: { download: async (url: string) => { const file = files.get(url); if (!file) throw new Error("missing"); return file; } } };
}

function payload(key: string, status: number, extra: Partial<CallbackPayload> = {}): CallbackPayload {
  return { key, status, ...extra } as CallbackPayload;
}
const at = (seconds: number) => new Date(Date.UTC(2026, 8, 28, 8, 0, seconds)).toISOString();

beforeEach(() => {
  sqlite.exec("DELETE FROM wiki_office_operations; DELETE FROM wiki_office_versions; DELETE FROM wiki_office_sessions; DELETE FROM wiki_office_documents; DELETE FROM attachments; DELETE FROM wiki_links; DELETE FROM wiki_pages;");
});

describe("office documents: creation and derived data", () => {
  it("creates the page with version 1 as head and derives search text and links", async () => {
    const target = await newPage("Target");
    const page = await createOfficePage({ title: "Linking", parentId: null, locale: "de", kind: "import", userId: "u1",
      prepared: prepareDocx(testDocx(`<w:p><w:hyperlink r:id="rId1"><w:r><w:t>see</w:t></w:r></w:hyperlink></w:p>`, {
        "word/_rels/document.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://x/wiki/pages/${target.slug}" TargetMode="External"/></Relationships>`,
      })) });
    expect(row<{ document_engine: string; document_mode: number }>("SELECT document_engine, document_mode FROM wiki_pages WHERE id = ?", page.id)).toEqual({ document_engine: "office", document_mode: 1 });
    expect(head(page.id)).toMatchObject({ kind: "import", version: 1 });
    expect(rows("SELECT target_page_id FROM wiki_links WHERE source_page_id = ?", page.id)).toEqual([{ target_page_id: target.id }]);
    expect(row<{ n: number }>("SELECT count(*) AS n FROM wiki_pages_fts WHERE wiki_pages_fts MATCH 'see'").n).toBe(1);
  });

  it("refuses the TipTap/Yjs paths for office pages", async () => {
    const page = await newPage();
    expect(() => savePageContentInternal({ id: page.id, contentJson: JSON.stringify({ type: "doc", content: [] }), expectedContentVersion: 1, editorSessionId: "session-1234" }, { id: "u1" }))
      .toThrow(/documentMovedToOffice/);
    expect(() => authorize("page", page.id, { id: "u1" })).toThrow(/documentMovedToOffice/);
  });
});

describe("office callbacks", () => {
  it("accepts the captured 9.4 payload shapes", async () => {
    const page = await newPage();
    const session = await getOrOpenSession(page.id);
    const { saved, deps } = server();
    await handleCallback(page.id, { ...fixtures.status1, key: session.key } as CallbackPayload, deps);
    expect(row<{ state: string }>("SELECT state FROM wiki_office_sessions WHERE key = ?", session.key).state).toBe("open");
    const forcesave = { ...fixtures.status6, key: session.key, url: saved("Forcesaved"), changesurl: undefined } as CallbackPayload;
    expect(await handleCallback(page.id, forcesave, deps)).toMatchObject({ ok: true, advanced: true });
    expect(head(page.id).kind).toBe("forcesave");
    // The key is kept after a forcesave; editors keep working in the same session.
    expect((await getOrOpenSession(page.id)).key).toBe(session.key);
    const final = { ...fixtures.status2, key: session.key, url: saved("Final"), changesurl: undefined } as CallbackPayload;
    expect(await handleCallback(page.id, final, deps)).toMatchObject({ ok: true, advanced: true });
    expect(head(page.id).kind).toBe("final");
    expect(headText(page.id)).toBe("Final");
    // After a final save the next editor gets a new key.
    expect((await getOrOpenSession(page.id)).key).not.toBe(session.key);
  });

  it("orders saves by lastsave, never moves the watermark back, and keeps late saves as branches", async () => {
    const page = await newPage();
    const { key } = await getOrOpenSession(page.id);
    const { saved, deps } = server();
    await handleCallback(page.id, payload(key, 6, { url: saved("thirty"), lastsave: at(30) }), deps);
    expect(await handleCallback(page.id, payload(key, 6, { url: saved("ten"), lastsave: at(10) }), deps)).toMatchObject({ advanced: false });
    expect(await handleCallback(page.id, payload(key, 6, { url: saved("twenty"), lastsave: at(20) }), deps)).toMatchObject({ advanced: false });
    expect(headText(page.id)).toBe("thirty");
    // A final save may reuse the last forcesave timestamp (one-second resolution).
    expect(await handleCallback(page.id, payload(key, 2, { url: saved("final"), lastsave: at(30), history: { serverVersion: "9.4.0", changes: [] } }), deps)).toMatchObject({ advanced: true });
    expect(head(page.id).kind).toBe("final");
    // A late forcesave after the session was finalised is kept, not promoted.
    expect(await handleCallback(page.id, payload(key, 6, { url: saved("late"), lastsave: at(40) }), deps)).toMatchObject({ advanced: false });
    expect(headText(page.id)).toBe("final");
    expect(rows<{ kind: string }>("SELECT kind FROM wiki_office_versions WHERE page_id = ? ORDER BY version", page.id).map((item) => item.kind))
      .toEqual(["create", "forcesave", "branch", "branch", "final", "branch"]);
  });

  it("treats a repeated callback as a no-op", async () => {
    const page = await newPage();
    const { key } = await getOrOpenSession(page.id);
    const { saved, deps } = server();
    const url = saved("once");
    const first = await handleCallback(page.id, payload(key, 6, { url, lastsave: at(5) }), deps);
    const again = await handleCallback(page.id, payload(key, 6, { url, lastsave: at(5) }), deps);
    expect(again).toMatchObject({ versionId: (first as { versionId: string }).versionId });
    expect(row<{ n: number }>("SELECT count(*) AS n FROM wiki_office_versions WHERE page_id = ?", page.id).n).toBe(2);
  });

  it("keeps the session on errors and reuses the key after status 3 and 4", async () => {
    const page = await newPage();
    const session = await getOrOpenSession(page.id);
    const { saved, deps } = server();
    await handleCallback(page.id, payload(session.key, 1, { users: ["u1"] }), deps);
    await handleCallback(page.id, payload(session.key, 7), deps);
    expect(row<{ state: string; last_error: string }>("SELECT state, last_error FROM wiki_office_sessions WHERE key = ?", session.key)).toEqual({ state: "open", last_error: "forcesaveError" });
    expect(await handleCallback(page.id, payload(session.key, 6, { url: saved("after error"), lastsave: at(9) }), deps)).toMatchObject({ advanced: true });
    await handleCallback(page.id, payload(session.key, 3), deps);
    expect((await getOrOpenSession(page.id)).key).toBe(session.key);
    await handleCallback(page.id, payload(session.key, 4), deps);
    expect(row<{ state: string }>("SELECT state FROM wiki_office_sessions WHERE key = ?", session.key).state).toBe("idle");
    expect((await getOrOpenSession(page.id)).key).toBe(session.key);
  });

  it("stores content from unknown keys as a branch instead of dropping it", async () => {
    const page = await newPage();
    const { saved, deps } = server();
    expect(await handleCallback(page.id, payload("forgotten-key", 2, { url: saved("orphan"), lastsave: at(1) }), deps)).toMatchObject({ ok: true, advanced: false });
    expect(row<{ kind: string }>("SELECT kind FROM wiki_office_versions WHERE session_key = 'forgotten-key'").kind).toBe("branch");
  });

  it("propagates download failures so the document server retries", async () => {
    const page = await newPage();
    const { key } = await getOrOpenSession(page.id);
    await expect(handleCallback(page.id, payload(key, 6, { url: "http://x/office/cache/files/nope", lastsave: at(1) }), server().deps)).rejects.toThrow();
    expect(head(page.id).kind).toBe("create");
  });
});

describe("staging", () => {
  it("never deletes a file another commit uses when an identical save fails", async () => {
    const page = await newPage();
    const { key } = await getOrOpenSession(page.id);
    const prepared = prepareDocx(docx("same bytes"));
    const ok = commitCallbackSave({ pageId: page.id, sessionKey: key, status: 6, lastsaveMs: 1000, prepared, changes: null, historyJson: null, userId: "u1" });
    const files = () => fs.readdirSync(uploads, { recursive: true }).filter((name) => String(name).endsWith(".docx")).length;
    const before = files();
    // Same bytes, but the session no longer exists → the transaction fails after staging.
    expect(() => commitCallbackSave({ pageId: page.id, sessionKey: "missing", status: 6, lastsaveMs: 2000, prepared, changes: null, historyJson: null, userId: "u1" })).toThrow();
    expect(files()).toBe(before);
    const version = row<{ attachment_id: string }>("SELECT attachment_id FROM wiki_office_versions WHERE id = ?", ok.versionId);
    expect(readVersionFile(version.attachment_id).equals(prepared.buffer)).toBe(true);
  });
});

describe("restore and checkpoint operations", () => {
  function deps(overrides: Partial<OperationDeps> & { onCommand?: (payload: { c: string; key: string; userdata?: string }) => Promise<void> | void } = {}) {
    let now = Date.UTC(2026, 8, 28, 9);
    const commands: Array<{ c: string; key: string; userdata?: string }> = [];
    const value: OperationDeps & { commands: typeof commands; advance: (ms: number) => void } = {
      commands,
      advance: (ms) => { now += ms; },
      now: () => now,
      sleep: async (ms) => { now += ms; await new Promise((resolve) => setTimeout(resolve, 0)); },
      command: async (payload) => {
        commands.push(payload);
        await overrides.onCommand?.(payload);
        if (payload.c === "info") return { error: 0, users: ["u1"] };
        return { error: 0 };
      },
      ...overrides,
    };
    return value;
  }

  it("restores after the dropped session's final save and keeps it in history", async () => {
    const page = await newPage();
    const target = head(page.id);
    const session = await getOrOpenSession(page.id);
    const { saved, deps: server1 } = server();
    await handleCallback(page.id, payload(session.key, 1, { users: ["u1"] }), server1);
    await handleCallback(page.id, payload(session.key, 6, { url: saved("edited"), lastsave: at(1) }), server1);
    const ops = deps({ onCommand: async (command) => {
      if (command.c === "drop") await handleCallback(page.id, payload(session.key, 2, { url: saved("edited final"), lastsave: at(2) }), server1);
    } });
    const result = await startRestore(page.id, target.id, "u1", ops);
    expect(result).toMatchObject({ state: "done" });
    expect(ops.commands.map((command) => command.c)).toEqual(["info", "drop"]);
    expect(headText(page.id)).toBe("Plan v1");
    expect(rows<{ kind: string }>("SELECT kind FROM wiki_office_versions WHERE page_id = ? ORDER BY version", page.id).map((item) => item.kind)).toEqual(["create", "forcesave", "final", "restore"]);
    expect(row<{ state: string }>("SELECT state FROM wiki_office_sessions WHERE key = ?", session.key).state).toBe("superseded");
  });

  it("restores immediately without a session and after status 4", async () => {
    const page = await newPage();
    const target = head(page.id);
    expect(await startRestore(page.id, target.id, "u1", deps())).toMatchObject({ state: "done" });
    const session = await getOrOpenSession(page.id);
    const { deps: server1 } = server();
    await handleCallback(page.id, payload(session.key, 1, { users: ["u1"] }), server1);
    const ops = deps({ onCommand: async (command) => { if (command.c === "drop") await handleCallback(page.id, payload(session.key, 4), server1); } });
    expect(await startRestore(page.id, target.id, "u1", ops)).toMatchObject({ state: "done" });
  });

  it("fails without replacing anything when the final save never arrives", async () => {
    const page = await newPage();
    const target = head(page.id);
    const session = await getOrOpenSession(page.id);
    const { saved, deps: server1 } = server();
    await handleCallback(page.id, payload(session.key, 1, { users: ["u1"] }), server1);
    await handleCallback(page.id, payload(session.key, 6, { url: saved("unsaved work"), lastsave: at(1) }), server1);
    const before = head(page.id);
    const result = await startRestore(page.id, target.id, "u1", deps());
    expect(result).toMatchObject({ state: "failed", failureReason: "timeout" });
    expect(head(page.id).id).toBe(before.id);
    expect((await getOrOpenSession(page.id)).key).toBe(session.key);
  });

  it("allows one active operation per page", async () => {
    const page = await newPage();
    const target = head(page.id);
    const session = await getOrOpenSession(page.id);
    await handleCallback(page.id, payload(session.key, 1, { users: ["u1"] }), server().deps);
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const ops = deps({ onCommand: async (command) => { if (command.c === "info") await blocked; } });
    const first = startRestore(page.id, target.id, "u1", ops);
    await new Promise((resolve) => setTimeout(resolve, 10));
    await expect(startCheckpoint(page.id, "u1", deps())).rejects.toBeInstanceOf(OfficeConflictError);
    await expect(getOrOpenSession(page.id)).rejects.toMatchObject({ code: "restoreInProgress" });
    release();
    await first;
  });

  it("resumes an operation created before a crash and terminates expired ones", async () => {
    const page = await newPage();
    const target = head(page.id);
    const session = await getOrOpenSession(page.id);
    await handleCallback(page.id, payload(session.key, 1, { users: ["u1"] }), server().deps);
    const ops = deps();
    sqlite.prepare("INSERT INTO wiki_office_operations (id, page_id, kind, session_key, target_version_id, expected_head_id, state, deadline_at, created_at) VALUES ('op-crash', ?, 'restore', ?, ?, ?, 'created', ?, ?)")
      .run(page.id, session.key, target.id, target.id, ops.now() + 60_000, ops.now());
    const { saved, deps: server1 } = server();
    const resumed = deps({ onCommand: async (command) => { if (command.c === "drop") await handleCallback(page.id, payload(session.key, 2, { url: saved("final"), lastsave: at(3) }), server1); } });
    await recoverOfficeOperations(resumed);
    expect(resumed.commands.map((command) => command.c)).toContain("drop");
    expect(row<{ state: string }>("SELECT state FROM wiki_office_operations WHERE id = 'op-crash'").state).toBe("done");

    sqlite.prepare("INSERT INTO wiki_office_operations (id, page_id, kind, target_version_id, expected_head_id, state, deadline_at, created_at) VALUES ('op-old', ?, 'restore', ?, ?, 'sent', ?, ?)")
      .run(page.id, target.id, target.id, ops.now() - 1, ops.now() - 120_000);
    await recoverOfficeOperations(ops);
    expect(row<{ state: string; failure_reason: string }>("SELECT state, failure_reason FROM wiki_office_operations WHERE id = 'op-old'")).toEqual({ state: "failed", failure_reason: "timeout" });
  });

  it("reports a checkpoint only when its own callback was stored", async () => {
    const page = await newPage();
    const session = await getOrOpenSession(page.id);
    const { saved, deps: server1 } = server();
    await handleCallback(page.id, payload(session.key, 1, { users: ["u1"] }), server1);
    const stored = await startCheckpoint(page.id, "u1", deps({ onCommand: async (command) => {
      if (command.c === "forcesave") await handleCallback(page.id, payload(session.key, 6, { url: saved("checkpoint"), lastsave: at(7), userdata: command.userdata }), server1);
    } }));
    expect(stored).toMatchObject({ state: "done", lastCommandResult: "stored" });
    const nothing = await startCheckpoint(page.id, "u1", deps({ command: async () => ({ error: 4 }) }));
    expect(nothing).toMatchObject({ state: "failed", failureReason: "nothingNew" });
    // The callback is held back by the server: never report success.
    const delayed = await startCheckpoint(page.id, "u1", deps());
    expect(delayed).toMatchObject({ state: "failed", failureReason: "timeout" });
  });

  it("runRestore is idempotent for finished operations", async () => {
    const page = await newPage();
    const done = await startRestore(page.id, head(page.id).id, "u1", deps());
    expect(await runRestore(done.id, deps())).toMatchObject({ state: "done" });
  });
});

