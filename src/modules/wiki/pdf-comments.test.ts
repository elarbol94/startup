import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ requireUserOrThrow: vi.fn(async () => ({ id: "author", name: "Author", role: "member" })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./pdf-processing", () => ({ retryPdfDocument: vi.fn() }));
vi.mock("@/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "drizzle" });
  sqlite.exec("INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role) VALUES ('author', 'Author', 'author@example.com', 1, 0, 0, 'member'), ('other', 'Other', 'other@example.com', 1, 0, 0, 'member')");
  return { sqlite, db };
});

import { db, sqlite } from "@/db";
import { attachments, wikiSources, wikiPdfDocuments, wikiPdfAnnotations, wikiPdfAnnotationComments } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { deletePdfAnnotationComment, updatePdfAnnotationComment } from "./pdf-actions";

beforeEach(() => {
  sqlite.exec("DELETE FROM wiki_sources; DELETE FROM attachments");
  vi.mocked(requireUserOrThrow).mockResolvedValue({ id: "author", name: "Author", role: "member" } as Awaited<ReturnType<typeof requireUserOrThrow>>);
  db.insert(wikiSources).values({ id: "source", title: "Source", createdBy: "author", updatedBy: "author" }).run();
  db.insert(attachments).values({ id: "file", fileName: "source.pdf", storedName: "source.pdf", mimeType: "application/pdf", sizeBytes: 1, sha256: "hash", entityType: "wikiSource", entityId: "source", uploadedBy: "author" }).run();
  db.insert(wikiPdfDocuments).values({ id: "pdf", sourceId: "source", attachmentId: "file", createdBy: "author" }).run();
  db.insert(wikiPdfAnnotations).values({ id: "anchor", sourceId: "source", documentId: "pdf", pageNumber: 1, kind: "bookmark", note: "Keep annotation", createdBy: "author", updatedBy: "author" }).run();
  db.insert(wikiPdfAnnotationComments).values([{ id: "own", annotationId: "anchor", body: "Own reply", createdBy: "author" }, { id: "other", annotationId: "anchor", body: "Other reply", createdBy: "other" }]).run();
});

describe("PDF comment management", () => {
  it("deletes just the chosen reply while retaining the annotation and other replies", async () => {
    await deletePdfAnnotationComment("own");
    expect(sqlite.prepare("SELECT id FROM wiki_pdf_annotation_comments").all()).toEqual([{ id: "other" }]);
    expect(sqlite.prepare("SELECT note FROM wiki_pdf_annotations").get()).toEqual({ note: "Keep annotation" });
  });
  it("rejects other authors and deleted annotations, while allowing admin moderation", async () => {
    await expect(deletePdfAnnotationComment("other")).rejects.toThrow("Forbidden");
    await expect(updatePdfAnnotationComment({ id: "other", body: "Overwrite" })).rejects.toThrow("Forbidden");
    sqlite.exec("UPDATE wiki_pdf_annotations SET deleted_at = 1");
    await expect(deletePdfAnnotationComment("own")).rejects.toThrow("Comment not found");
    sqlite.exec("UPDATE wiki_pdf_annotations SET deleted_at = NULL");
    vi.mocked(requireUserOrThrow).mockResolvedValue({ id: "author", name: "Author", role: "admin" } as Awaited<ReturnType<typeof requireUserOrThrow>>);
    await deletePdfAnnotationComment("other");
    expect(sqlite.prepare("SELECT id FROM wiki_pdf_annotation_comments").all()).toEqual([{ id: "own" }]);
  });
});
