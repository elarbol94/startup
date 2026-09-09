import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
vi.mock("server-only", () => ({}));
vi.mock("@/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "drizzle" });
  return { db, sqlite };
});
import { db, sqlite } from "@/db";
import { account, session, user, userInvitations, userProfilePreferences, projects } from "@/db/schema";
import { removeUserAccount } from "./user-removal";
import { listUsers } from "./queries";

beforeEach(() => {
  db.delete(projects).run();
  db.delete(user).run();
  const now = new Date();
  db.insert(user).values([
    { id: "admin", name: "Admin", email: "admin@example.com", username: "admin", role: "admin", createdAt: now, updatedAt: now },
    { id: "member", name: "Author", email: "member@example.com", username: "member", role: "member", createdAt: now, updatedAt: now },
  ]).run();
  db.insert(account).values({ id: "credential", accountId: "member", providerId: "credential", userId: "member", password: "hashed", createdAt: now, updatedAt: now }).run();
  db.insert(session).values({ id: "session", token: "token", userId: "member", expiresAt: new Date(Date.now()+86400000), createdAt: now, updatedAt: now }).run();
  db.insert(userProfilePreferences).values({ userId: "member", markColor: "blue", updatedAt: now }).run();
});
afterAll(() => sqlite.close());

it("removes access and account selectors while preserving authored business history", () => {
  db.insert(projects).values({ id: "history", name: "Important project", createdBy: "member", managerId: "member" }).run();
  expect(removeUserAccount("member", "admin")).toEqual({ error: null });
  const removed = db.select().from(user).where(eq(user.id, "member")).get()!;
  expect(removed).toMatchObject({ name: "Author", banned: true, role: "member", username: null, displayUsername: null });
  expect(removed.removedAt).toBeInstanceOf(Date);
  expect(removed.email).toMatch(/@removed\.invalid$/);
  expect(db.select().from(session).all()).toEqual([]);
  expect(db.select().from(account).all()).toEqual([]);
  expect(db.select().from(userProfilePreferences).all()).toEqual([]);
  expect(listUsers().map((row) => row.id)).toEqual(["admin"]);
  expect(db.select({ author: user.name }).from(projects).innerJoin(user, eq(projects.createdBy, user.id)).get()).toEqual({ author: "Author" });
  expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  expect(removeUserAccount("member", "admin")).toEqual({ error: "userNotFound" });
});
it("does not remove the acting admin, including the last remaining admin", () => {
  expect(removeUserAccount("admin", "admin")).toEqual({ error: "cannotRemoveSelf" });
  expect(db.select().from(user).where(eq(user.id, "admin")).get()?.removedAt).toBeNull();
});
it("rejects non-admin and removed callers, preventing mutual removal", () => {
  expect(() => removeUserAccount("admin", "member")).toThrow("Forbidden");
  db.update(user).set({ role: "admin" }).where(eq(user.id, "member")).run();
  expect(removeUserAccount("member", "admin")).toEqual({ error: null });
  expect(() => removeUserAccount("admin", "member")).toThrow("Forbidden");
  expect(listUsers().map((row) => row.id)).toEqual(["admin"]);
});
it("revokes invitations addressed to or issued by the removed account", () => {
  const now = new Date();
  const expiresAt = new Date(Date.now()+86400000);
  db.insert(userInvitations).values([
    { email: "member@example.com", invitedBy: "admin", tokenHash: "one", role: "member", createdAt: now, expiresAt, sentAt: now },
    { email: "other@example.com", invitedBy: "member", tokenHash: "two", role: "member", createdAt: now, expiresAt },
    { email: "unrelated@example.com", invitedBy: "admin", tokenHash: "three", role: "member", createdAt: now, expiresAt, sentAt: now },
  ]).run();
  removeUserAccount("member", "admin");
  expect(db.select().from(userInvitations).all().map((row)=>row.tokenHash)).toEqual(["three"]);
});
it("rolls back all changes on a storage failure", () => {
  sqlite.exec("CREATE TRIGGER fail_removal BEFORE DELETE ON account BEGIN SELECT RAISE(ABORT, 'test failure'); END");
  try {
    expect(() => removeUserAccount("member", "admin")).toThrow();
    expect(db.select().from(user).where(eq(user.id, "member")).get()).toMatchObject({ email: "member@example.com", username: "member", removedAt: null });
    expect(db.select().from(session).all()).toHaveLength(1);
    expect(db.select().from(account).all()).toHaveLength(1);
  } finally { sqlite.exec("DROP TRIGGER fail_removal"); }
});
it("returns a missing-user error without affecting other accounts", () => {
  expect(removeUserAccount("missing", "admin")).toEqual({ error: "userNotFound" });
  expect(listUsers()).toHaveLength(2);
});
