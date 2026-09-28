import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const auth = vi.hoisted(() => ({ requireUserOrThrow: vi.fn() }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => cache);
vi.mock("@/lib/auth", () => auth);
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
import { networkContacts, networkLeads, user } from "@/db/schema";
import { updateNetworkContact } from "./contact-actions";
import { listNetworkContacts } from "./queries";
import { listNetworkOverview, listReconnectDue } from "./reconnect-queries";

const aaron = { id: "aaron", role: "member" };
const colleague = { id: "colleague", role: "member" };
const admin = { id: "admin", role: "admin" };
const today = "2026-09-28";

type ContactRow = typeof networkContacts.$inferInsert;
function contact(values: Partial<ContactRow> & { id: string; name: string }) {
  db.insert(networkContacts).values({ ownerId: "aaron", visibility: "private", ...values }).run();
}
const ids = (items: { id: string }[]) => items.map((item) => item.id);

beforeEach(() => {
  db.delete(networkContacts).run();
  db.delete(user).run();
  cache.revalidatePath.mockClear();
  const now = new Date();
  db.insert(user).values([aaron, colleague, admin].map((viewer) => ({
    id: viewer.id, name: viewer.id, email: `${viewer.id}@example.com`, role: viewer.role, createdAt: now, updatedAt: now,
  }))).run();
  auth.requireUserOrThrow.mockResolvedValue(aaron);

  // Due 2026-09-01 (overdue).
  contact({ id: "overdue", name: "Olga", lastContactOn: "2026-06-03", reconnectEveryDays: 90 });
  // Due exactly today.
  contact({ id: "today", name: "Tom", lastContactOn: "2026-08-29", reconnectEveryDays: 30, visibility: "team" });
  // Never contacted: due at once, listed first.
  contact({ id: "never", name: "Nina", reconnectEveryDays: 180 });
  // Due tomorrow: not yet.
  contact({ id: "tomorrow", name: "Toni", lastContactOn: "2026-08-30", reconnectEveryDays: 30 });
  // No cadence.
  contact({ id: "plain", name: "Paul", lastContactOn: "2020-01-01" });
  // The colleague's shared contact with a cadence: theirs to keep in touch with, not aaron's.
  contact({ id: "theirs", name: "Clara", ownerId: "colleague", visibility: "team", reconnectEveryDays: 30 });
});
afterAll(() => sqlite.close());

describe("listReconnectDue", () => {
  it("lists the viewer's own due contacts, never contacted first, then by due date", () => {
    const result = listReconnectDue(aaron, { today });
    expect(ids(result.contacts)).toEqual(["never", "overdue", "today"]);
    expect(result.total).toBe(3);
    expect(result.contacts[0]).toMatchObject({ dueOn: "", reconnectEveryDays: 180, lastContactOn: null });
    expect(result.contacts[1]).toMatchObject({ dueOn: "2026-09-01", name: "Olga", visibility: "private" });
  });

  it("only includes contacts the viewer owns, even shared ones and for admins", () => {
    expect(ids(listReconnectDue(colleague, { today }).contacts)).toEqual(["theirs"]);
    expect(listReconnectDue(admin, { today }).total).toBe(0);
  });

  it("limits the rows but counts all of them", () => {
    const result = listReconnectDue(aaron, { today, limit: 2 });
    expect(ids(result.contacts)).toEqual(["never", "overdue"]);
    expect(result.total).toBe(3);
    expect(listReconnectDue(aaron, { today, limit: 0 }).contacts).toEqual([]);
  });

  it("breaks ties on the due date by name", () => {
    contact({ id: "also-today", name: "Anton", lastContactOn: "2026-06-30", reconnectEveryDays: 90 });
    expect(ids(listReconnectDue(aaron, { today }).contacts)).toEqual(["never", "overdue", "also-today", "today"]);
  });
});

describe("dashboard overview", () => {
  it("shows follow-ups first, then reconnects within the limit, and counts both", () => {
    db.insert(networkLeads).values([
      { contactId: "plain", summary: "Intro to the mayor", createdBy: "aaron" },
      { contactId: "plain", summary: "Closed one", status: "done", createdBy: "aaron" },
    ]).run();
    const overview = listNetworkOverview(aaron, { today });
    expect(overview.leads.map((lead) => lead.summary)).toEqual(["Intro to the mayor"]);
    expect(ids(overview.reconnects)).toEqual(["never", "overdue", "today"]);
    expect(overview.total).toBe(4);

    const small = listNetworkOverview(aaron, { today, limit: 2 });
    expect(small.leads).toHaveLength(1);
    expect(ids(small.reconnects)).toEqual(["never"]);
    expect(small.total).toBe(4);
  });
});

describe("cadence on the contact", () => {
  const cadence = (id: string) =>
    db.select({ days: networkContacts.reconnectEveryDays }).from(networkContacts).where(eq(networkContacts.id, id)).get()?.days;

  it("is saved, validated and cleared through updateNetworkContact", async () => {
    expect(await updateNetworkContact({ id: "plain", name: "Paul", reconnectEveryDays: 90 })).toEqual({ ok: true });
    expect(cadence("plain")).toBe(90);
    expect(cache.revalidatePath).toHaveBeenCalledWith("/");

    for (const reconnectEveryDays of [0, 6, 731, 30.5]) {
      expect(await updateNetworkContact({ id: "plain", name: "Paul", reconnectEveryDays })).toEqual({ ok: false, error: "invalid" });
    }
    expect(cadence("plain")).toBe(90);

    expect(await updateNetworkContact({ id: "plain", name: "Paul", reconnectEveryDays: null })).toEqual({ ok: true });
    expect(cadence("plain")).toBeNull();
  });

  it("can only be set by someone who may edit the contact", async () => {
    auth.requireUserOrThrow.mockResolvedValue(colleague);
    expect(await updateNetworkContact({ id: "overdue", name: "Olga", reconnectEveryDays: 30 })).toEqual({ ok: false, error: "notFound" });
    expect(cadence("overdue")).toBe(90);
  });
});

describe("reconnect sort of the contact list", () => {
  it("orders never contacted first, then due date, contacts without a cadence last", () => {
    const result = listNetworkContacts(aaron, { sort: "reconnect" });
    // Clara (colleague's team contact) has a cadence and has never been contacted.
    expect(ids(result.contacts)).toEqual(["theirs", "never", "overdue", "today", "tomorrow", "plain"]);
  });
});
