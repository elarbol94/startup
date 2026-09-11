import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "drizzle" });
  sqlite.exec("INSERT INTO user (id, name, email, emailVerified, createdAt, updatedAt, role) VALUES ('owner', 'Owner', 'owner@example.com', 1, 0, 0, 'member')");
  return { db, sqlite };
});

import { db, sqlite } from "@/db";
import { wikiPages, wikiSources, wikiPresentations, wikiPresentationAccess } from "@/db/schema";
import { getWikiNavigationItems, resolveWikiNavigationPaths, resolveRecentlyOpenedPaths } from "./navigation-queries";

it("finds all three libraries without exposing restricted or deleted items", () => {
  db.insert(wikiPages).values([
    { id: "document", slug: "research", title: "Research document", createdBy: "owner", updatedBy: "owner" },
    { id: "deleted", slug: "deleted", title: "Research deleted", createdBy: "owner", updatedBy: "owner", deletedAt: new Date() },
  ]).run();
  db.insert(wikiSources).values({ id: "source", title: "Research source", createdBy: "owner", updatedBy: "owner" }).run();
  db.insert(wikiPresentations).values([
    { id: "public", title: "Research public", createdBy: "owner", updatedBy: "owner" },
    { id: "private", title: "Research private", createdBy: "owner", updatedBy: "owner" },
  ]).run();
  db.insert(wikiPresentationAccess).values({ presentationId: "private", restricted: true }).run();
  const viewer = { id: "reader", role: "member" };
  expect(getWikiNavigationItems(viewer, "Research").map((item) => item.id).sort()).toEqual(["document", "public", "source"]);
  expect(getWikiNavigationItems({ id: "owner" }, "private").map((item) => item.id)).toEqual(["private"]);
  expect(getWikiNavigationItems(viewer, "%")).toEqual([]);
  expect(getWikiNavigationItems(viewer, "_")).toEqual([]);
  expect(resolveWikiNavigationPaths(viewer, ["/wiki/pages/research", "/wiki/pages/deleted", "/wiki/sources/source/read/pdf", "/wiki/presentations/private", "https://example.com"]).map((item) => item.id)).toEqual(["document", "source"]);
});

it("recent items preserve opening order, PDF reader links and access checks", () => {
  sqlite.prepare("INSERT INTO attachments (id, file_name, stored_name, mime_type, size_bytes, sha256, entity_type, entity_id, uploaded_by, created_at) VALUES ('pdf-file', 'Study.pdf', 'study.pdf', 'application/pdf', 1, 'hash', 'wiki_source', 'source', 'owner', 0)").run();
  sqlite.prepare("INSERT INTO wiki_pdf_documents (id, source_id, attachment_id, created_by, created_at, updated_at) VALUES ('pdf', 'source', 'pdf-file', 'owner', 0, 0)").run();
  const paths = ["/wiki/presentations/public/present", "/wiki/sources/source/read/pdf", "/wiki/pages/research", "/wiki/presentations/public", "/wiki/sources/source", "/wiki/sources/wrong/read/pdf", "/wiki/sources/source/read/missing", "/wiki/pages/deleted", "/wiki/presentations/private", "https://example.com"];
  expect(resolveRecentlyOpenedPaths({ id: "reader" }, paths).map(item => [item.kind, item.href, item.title])).toEqual([
    ["presentation", "/wiki/presentations/public", "Research public"],
    ["pdf", "/wiki/sources/source/read/pdf", "Study.pdf"],
    ["document", "/wiki/pages/research", "Research document"],
  ]);
  sqlite.prepare("UPDATE wiki_sources SET deleted_at = 1 WHERE id = 'source'").run();
  expect(resolveRecentlyOpenedPaths({ id: "reader" }, ["/wiki/sources/source/read/pdf"])).toEqual([]);
});
