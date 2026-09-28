import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const auth = vi.hoisted(() => ({ requireUserOrThrow: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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
import { networkContacts, networkOrganizations, networkLeads, networkTags, user } from "@/db/schema";
import {
  quickCaptureContact,
  setNetworkContactVisibility,
} from "./contact-actions";
import { saveNetworkLead } from "./lead-actions";
import { bulkDeleteContacts, bulkDeleteLeads, bulkSetContactVisibility, bulkSetLeadStatus, bulkUpdateContactTags } from "./bulk-actions";
import {
  getNetworkContact,
  listNetworkLeads,
  listNetworkTagNames,
} from "./queries";

const aaron = { id: "aaron", role: "member" };
const colleague = { id: "colleague", role: "member" };
const admin = { id: "admin", role: "admin" };
const as = (viewer: { id: string; role: string }) => auth.requireUserOrThrow.mockResolvedValue(viewer);

async function capture(input: Parameters<typeof quickCaptureContact>[0]) {
  const result = await quickCaptureContact(input);
  if (!result.ok) throw new Error(result.error);
  return result.contactId;
}

beforeEach(() => {
  db.delete(networkContacts).run();
  db.delete(networkTags).run();
  db.delete(networkOrganizations).run();
  db.delete(user).run();
  const now = new Date();
  db.insert(user).values([aaron, colleague, admin].map((viewer) => ({
    id: viewer.id, name: viewer.id, email: `${viewer.id}@example.com`, role: viewer.role, createdAt: now, updatedAt: now,
  }))).run();
  as(aaron);
});
afterAll(() => sqlite.close());


const tagsOf = (viewer: { id: string; role: string }, id: string) => getNetworkContact(viewer, id)!.tags.map((tag) => tag.name);
const shared = async (name: string, tags: string[] = []) => {
  const id = await capture({ name, tags });
  const result = await setNetworkContactVisibility({ contactId: id, visibility: "team" });
  if (!result.ok) throw new Error(result.error);
  return id;
};

describe("bulk contact tags", () => {
  it("adds and removes tags without touching the others", async () => {
    const a = await capture({ name: "A", tags: ["keep", "drop"] });
    const b = await capture({ name: "B", tags: ["Drop"] });
    const outcome = await bulkUpdateContactTags({ ids: [a, b], add: ["New", "keep"], remove: ["DROP"] });
    expect(outcome.succeededIds).toEqual([a, b]);
    expect(tagsOf(aaron, a)).toEqual(["keep", "New"]);
    expect(tagsOf(aaron, b)).toEqual(["keep", "New"]);
    expect(listNetworkTagNames(aaron)).not.toContain("drop");
  });
  it("skips contacts that would exceed the tag limit", async () => {
    const full = await capture({ name: "Full", tags: Array.from({ length: 20 }, (_, index) => `t${index}`) });
    const empty = await capture({ name: "Empty" });
    const outcome = await bulkUpdateContactTags({ ids: [full, empty], add: ["extra"] });
    expect(outcome.skipped).toEqual([{ id: full, reason: "tooManyTags" }]);
    expect(tagsOf(aaron, empty)).toEqual(["extra"]);
  });
  it("does not reveal or change another user's private contacts", async () => {
    const mine = await capture({ name: "Mine" });
    as(colleague);
    const theirs = await capture({ name: "Theirs" });
    as(aaron);
    const outcome = await bulkUpdateContactTags({ ids: [mine, theirs], add: ["x"] });
    expect(outcome.succeededIds).toEqual([mine]);
    expect(outcome.skipped).toEqual([{ id: theirs, reason: "notFound" }]);
    as(colleague);
    expect(tagsOf(colleague, theirs)).toEqual([]);
  });
});

describe("bulk contact visibility and delete", () => {
  it("lets colleagues edit shared contacts but only owners and admins manage them", async () => {
    const team = await shared("Team");
    const mine = await capture({ name: "Mine" });
    as(colleague);
    const theirs = await capture({ name: "Colleague private" });
    expect((await bulkUpdateContactTags({ ids: [team], add: ["shared"] })).succeededIds).toEqual([team]);
    expect((await bulkDeleteContacts({ ids: [team, mine] })).skipped).toEqual([{ id: team, reason: "forbidden" }, { id: mine, reason: "notFound" }]);
    as(admin);
    const outcome = await bulkDeleteContacts({ ids: [team, theirs] });
    expect(outcome.succeededIds).toEqual([team]);
    expect(outcome.skipped).toEqual([{ id: theirs, reason: "notFound" }]);
    expect(db.select().from(networkContacts).where(eq(networkContacts.id, theirs)).get()).toBeDefined();
  });
  it("changes visibility of managed contacts and keeps the name on introducing leads", async () => {
    const a = await capture({ name: "A" });
    const b = await capture({ name: "B", note: "Introduces A" });
    const lead = listNetworkLeads(aaron).find((item) => item.contactId === b)!;
    await saveNetworkLead({ id: lead.id, contactId: b, summary: lead.summary, targetContactId: a });
    expect((await bulkSetContactVisibility({ ids: [a, b], visibility: "team" })).succeededIds).toEqual([a, b]);
    expect(getNetworkContact(aaron, a)!.visibility).toBe("team");
    await bulkDeleteContacts({ ids: [a] });
    expect(db.select().from(networkLeads).where(eq(networkLeads.id, lead.id)).get()!.targetName).toBe("A");
  });
  it("rejects empty and oversized batches", async () => {
    await expect(bulkDeleteContacts({ ids: [] })).rejects.toThrow();
    await expect(bulkDeleteContacts({ ids: Array.from({ length: 501 }, (_, index) => `c${index}`) })).rejects.toThrow();
  });
});

describe("bulk leads", () => {
  it("sets status and deletes leads the viewer may edit", async () => {
    const a = await capture({ name: "A", note: "First" });
    const b = await capture({ name: "B", note: "Second" });
    as(colleague);
    const hidden = await capture({ name: "Hidden", note: "Private lead" });
    const hiddenLead = listNetworkLeads(colleague).find((item) => item.contactId === hidden)!.id;
    as(aaron);
    const ids = listNetworkLeads(aaron).filter((item) => [a, b].includes(item.contactId)).map((item) => item.id);
    const outcome = await bulkSetLeadStatus({ ids: [...ids, hiddenLead], status: "done" });
    expect(outcome.succeededIds.sort()).toEqual([...ids].sort());
    expect(outcome.skipped).toEqual([{ id: hiddenLead, reason: "notFound" }]);
    expect(listNetworkLeads(aaron).filter((item) => ids.includes(item.id)).every((item) => item.status === "done")).toBe(true);
    await bulkDeleteLeads({ ids });
    expect(db.select().from(networkLeads).all().map((lead) => lead.id)).toEqual([hiddenLead]);
  });
});
