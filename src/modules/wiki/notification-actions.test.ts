import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ requireUserOrThrow: vi.fn(async () => ({ id: "alice" })) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { default: Database } = await import("better-sqlite3");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "drizzle" });
  return { db, sqlite };
});

import { revalidatePath } from "next/cache";
import { db, sqlite } from "@/db";
import { user, wikiNotifications } from "@/db/schema";
import { getUnreadNotificationCount } from "./research-queries";
import { markNotificationsRead } from "./notification-actions";

beforeEach(() => {
  vi.mocked(revalidatePath).mockClear();
  sqlite.exec("DELETE FROM wiki_notifications;");
  for (const id of ["alice", "bob"]) {
    db.insert(user).values({ id, name: id, email: `${id}@example.com`, createdAt: new Date(), updatedAt: new Date() }).onConflictDoNothing().run();
  }
  db.insert(wikiNotifications).values([
    { id: "n1", userId: "alice", actorId: "bob", type: "mention" },
    { id: "n2", userId: "alice", actorId: "bob", type: "mention" },
    { id: "n3", userId: "bob", actorId: "alice", type: "mention" },
  ]).run();
});

describe("markNotificationsRead", () => {
  it("marks a single opened notification read and refreshes the dashboard counts", async () => {
    await markNotificationsRead(["n1"]);
    expect(getUnreadNotificationCount("alice")).toBe(1);
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("marks all of the current user's notifications read, never someone else's", async () => {
    await markNotificationsRead(["n3"]);
    expect(getUnreadNotificationCount("bob")).toBe(1);
    expect(revalidatePath).not.toHaveBeenCalled();
    await markNotificationsRead();
    expect(getUnreadNotificationCount("alice")).toBe(0);
    expect(getUnreadNotificationCount("bob")).toBe(1);
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
});
