import { afterAll, beforeAll, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./lib/pdf-node", () => ({ openPdfDocument: vi.fn(), pdfMetadataAsInfo: vi.fn() }));
vi.mock("./lib/vector-store.server", () => ({ indexText: vi.fn() }));
vi.mock("@/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "drizzle" });
  sqlite.exec("INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role) VALUES ('author', 'Author', 'author@example.com', 1, 0, 0, 'member')");
  return { sqlite, db };
});

import { db, sqlite } from "@/db";
import { attachments, wikiPdfDocuments, wikiSources } from "@/db/schema";
import { processNextPdf } from "./pdf-processing";

beforeAll(() => {
  db.insert(wikiSources).values({ id: "source", title: "Source", createdBy: "author", updatedBy: "author" }).run();
  db.insert(attachments).values([
    { id: "stuck-file", fileName: "a.pdf", storedName: "a.pdf", mimeType: "application/pdf", sizeBytes: 1, sha256: "a", entityType: "wikiSource", entityId: "source", uploadedBy: "author" },
    { id: "live-file", fileName: "b.pdf", storedName: "b.pdf", mimeType: "application/pdf", sizeBytes: 1, sha256: "b", entityType: "wikiSource", entityId: "source", uploadedBy: "author" },
  ]).run();
  const longAgo = new Date(Date.now() - 60 * 60_000);
  db.insert(wikiPdfDocuments).values([
    { id: "stuck", sourceId: "source", attachmentId: "stuck-file", createdBy: "author", status: "extracting", attempts: 3, lockedAt: longAgo },
    { id: "live", sourceId: "source", attachmentId: "live-file", createdBy: "author", status: "ocr", attempts: 3, lockedAt: new Date() },
  ]).run();
});
afterAll(() => sqlite.close());

it("fails a job whose process died on its last allowed attempt instead of leaving it extracting forever", async () => {
  expect(await processNextPdf()).toBe(false);
  expect(sqlite.prepare("SELECT id, status, error, locked_at AS lockedAt FROM wiki_pdf_documents ORDER BY id").all()).toEqual([
    { id: "live", status: "ocr", error: "", lockedAt: expect.any(Number) },
    { id: "stuck", status: "failed", error: "Processing was interrupted repeatedly", lockedAt: null },
  ]);
});
