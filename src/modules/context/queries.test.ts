import { afterAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

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
import { attachments, contextLinks, evidenceLinks, projects, wikiPages, wikiPageSources, wikiPdfAnnotations, wikiPdfDocuments, wikiSources } from "@/db/schema";
import { listEntityContext, searchKnowledgeCandidates, searchWorkspaceRows } from "./queries";
import { eq } from "drizzle-orm";
import { listEvidenceForTarget } from "@/modules/wiki/pdf-queries";
import { listCalendarWorkspace } from "@/modules/calendar/queries";
import { tasks, taskContexts } from "@/modules/projects/schema";

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

describe("cross-section links", () => {
  it.each(["task", "deadline"] as const)("keeps calendar %s focus before source anchors", (kind) => {
    const id = `calendar-${kind}`;
    db.insert(tasks).values({ id, title: "Calendar source", kind, dueDate: "2026-09-17", createdBy: "author" }).run();
    db.insert(taskContexts).values({ taskId: id, type: "wikiPage", entityId: "page", route: "/wiki/pages/name-document?section=budget&task=stale#notes" }).run();
    const workspace = listCalendarWorkspace({ userId: "author", from: "2026-09-01", to: "2026-10-01" });
    expect(workspace.items.find(item => item.sourceId === id)?.href).toBe(`/wiki/pages/name-document?section=budget&${kind}=${id}#notes`);
  });
  it("resolves renamed documents and sources while preserving document anchors", () => {
    db.insert(projects).values({ id: "linked-project", name: "Project", createdBy: "author" }).run();
    db.insert(wikiPages).values({ id: "renamed-page", title: "Current document", slug: "current-document", createdBy: "author", updatedBy: "author" }).run();
    db.insert(wikiSources).values({ id: "renamed-source", title: "Current source", createdBy: "author", updatedBy: "author" }).run();
    db.insert(contextLinks).values([
      { ownerType: "project", ownerId: "linked-project", targetType: "wikiPage", targetId: "renamed-page", route: "/wiki/pages/old-document?section=budget#detail", label: "Old document", createdBy: "author" },
      { ownerType: "project", ownerId: "linked-project", targetType: "wikiSource", targetId: "renamed-source", route: "/wiki/sources/renamed-source", label: "Old source", createdBy: "author" },
    ]).run();
    const result = listEntityContext("project", "linked-project");
    expect(result.wiki[0]).toMatchObject({ title: "Current document", href: "/wiki/pages/current-document?section=budget#detail" });
    expect(result.sources[0]).toMatchObject({ title: "Current source" });
  });

  it("hides trashed source/document backlinks and restores them when the target returns", () => {
    db.insert(wikiPages).values({ id: "trash-page", title: "Document", slug: "trash-page", createdBy: "author", updatedBy: "author" }).run();
    db.insert(wikiSources).values({ id: "trash-source", title: "Source", createdBy: "author", updatedBy: "author" }).run();
    db.insert(wikiPageSources).values({ pageId: "trash-page", sourceId: "trash-source", relation: "supporting" }).run();
    db.update(wikiSources).set({ deletedAt: new Date() }).where(eq(wikiSources.id, "trash-source")).run();
    expect(listEntityContext("wikiPage", "trash-page").sources).toEqual([]);
    db.update(wikiSources).set({ deletedAt: null }).where(eq(wikiSources.id, "trash-source")).run();
    expect(listEntityContext("wikiPage", "trash-page").sources).toHaveLength(1);
    db.update(wikiPages).set({ deletedAt: new Date() }).where(eq(wikiPages.id, "trash-page")).run();
    expect(listEntityContext("wikiSource", "trash-source").wiki).toEqual([]);
  });

  it("does not navigate to deleted PDF annotations or trashed PDF sources", () => {
    db.insert(wikiSources).values({ id: "evidence-source", title: "Evidence source", createdBy: "author", updatedBy: "author" }).run();
    db.insert(attachments).values({ id: "evidence-file", fileName: "evidence.pdf", storedName: "evidence.pdf", mimeType: "application/pdf", sizeBytes: 1, sha256: "evidence-hash", entityType: "wikiSource", entityId: "evidence-source", uploadedBy: "author" }).run();
    db.insert(wikiPdfDocuments).values({ id: "evidence-pdf", sourceId: "evidence-source", attachmentId: "evidence-file", createdBy: "author" }).run();
    db.insert(wikiPdfAnnotations).values({ id: "evidence-annotation", documentId: "evidence-pdf", sourceId: "evidence-source", pageNumber: 1, kind: "text", createdBy: "author", updatedBy: "author" }).run();
    db.insert(evidenceLinks).values({ annotationId: "evidence-annotation", targetType: "project", targetId: "evidence-project", createdBy: "author" }).run();
    expect(listEntityContext("project", "evidence-project").sources).toHaveLength(1);
    db.update(wikiPdfAnnotations).set({ deletedAt: new Date() }).where(eq(wikiPdfAnnotations.id, "evidence-annotation")).run();
    expect(listEntityContext("project", "evidence-project").sources).toEqual([]);
    db.update(wikiPdfAnnotations).set({ deletedAt: null }).where(eq(wikiPdfAnnotations.id, "evidence-annotation")).run();
    db.update(wikiSources).set({ deletedAt: new Date() }).where(eq(wikiSources.id, "evidence-source")).run();
    expect(listEntityContext("project", "evidence-project").sources).toEqual([]);
    expect(listEvidenceForTarget("project", "evidence-project")[0].deletedAt).not.toBeNull();
    db.update(wikiSources).set({ deletedAt: null }).where(eq(wikiSources.id, "evidence-source")).run();
    expect(listEvidenceForTarget("project", "evidence-project")[0].deletedAt).toBeNull();
  });

  it("preserves a task's PDF position and focus and hides unavailable linked targets", () => {
    db.insert(wikiSources).values({ id: "task-source", title: "Task source", createdBy: "author", updatedBy: "author" }).run();
    db.insert(attachments).values({ id: "task-file", fileName: "task.pdf", storedName: "task.pdf", mimeType: "application/pdf", sizeBytes: 1, sha256: "task-hash", entityType: "wikiSource", entityId: "task-source", uploadedBy: "author" }).run();
    db.insert(wikiPdfDocuments).values({ id: "task-pdf", sourceId: "task-source", attachmentId: "task-file", createdBy: "author" }).run();
    db.insert(contextLinks).values([
      { ownerType: "task", ownerId: "focused-task", targetType: "pdf", targetId: "task-pdf", route: "/wiki/sources/old-source/read/task-pdf?page=3&annotation=highlight#selection", label: "PDF · page 3", relation: "origin", createdBy: "author" },
      { ownerType: "task", ownerId: "focused-task", targetType: "wikiPage", targetId: "missing-page", route: "/wiki/pages/missing-page", label: "Missing", createdBy: "author" },
      { ownerType: "task", ownerId: "focused-task", targetType: "wikiSource", targetId: "task-source", route: "/wiki/sources/task-source", label: "Source", createdBy: "author" },
    ]).run();
    const result = listEntityContext("task", "focused-task");
    expect(result.wiki).toEqual([]);
    expect(result.sources).toHaveLength(2);
    expect(result.sources.find(item => item.type === "pdf")).toMatchObject({
      title: "PDF · page 3",
      href: "/wiki/sources/task-source/read/task-pdf?page=3&annotation=highlight&task=focused-task#selection",
    });
    db.update(wikiSources).set({ deletedAt: new Date() }).where(eq(wikiSources.id, "task-source")).run();
    expect(listEntityContext("task", "focused-task").sources).toEqual([]);
  });
});
