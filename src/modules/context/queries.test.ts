import { afterAll, describe, expect, it, vi } from "vitest";

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
import { attachments, wikiPages, wikiPdfDocuments, wikiSources } from "@/db/schema";
import { searchKnowledgeCandidates, searchWorkspaceRows } from "./queries";

afterAll(() => sqlite.close());

describe("context search", () => {
  it("returns wiki, source and PDF candidates even before PDF text is extracted", () => {
    db.insert(wikiPages).values({ id: "page", title: "Name document", slug: "name-document", createdBy: "author", updatedBy: "author" }).run();
    db.insert(wikiSources).values({ id: "source", title: "Name source", createdBy: "author", updatedBy: "author" }).run();
    db.insert(attachments).values({ id: "file", fileName: "source.pdf", storedName: "source.pdf", mimeType: "application/pdf", sizeBytes: 1, sha256: "hash", entityType: "wikiSource", entityId: "source", uploadedBy: "author" }).run();
    db.insert(wikiPdfDocuments).values({ id: "pdf", sourceId: "source", attachmentId: "file", createdBy: "author" }).run();

    for (const query of ["", "Name"]) {
      expect(searchKnowledgeCandidates(query).map(({ type, id }) => ({ type, id }))).toEqual([
        { type: "wikiPage", id: "page" },
        { type: "wikiSource", id: "source" },
        { type: "pdf", id: "pdf" },
      ]);
    }
    expect(searchKnowledgeCandidates("no matching item")).toEqual([]);
    expect(searchWorkspaceRows("Name")).toHaveLength(3);
  });
});
