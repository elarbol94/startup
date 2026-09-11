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

import { db } from "@/db";
import { wikiPages, wikiSources, wikiPresentations, wikiPresentationAccess } from "@/db/schema";
import { getWikiNavigationItems, resolveWikiNavigationPaths } from "./navigation-queries";

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
