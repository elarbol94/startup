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
import { networkContacts, networkInteractions, networkOrganizations, networkTags, tasks, user } from "@/db/schema";
import { markNetworkContactContacted, quickCaptureContact, setNetworkContactVisibility, updateNetworkContact } from "./contact-actions";
import { addNetworkInteraction, deleteNetworkInteraction, updateNetworkInteraction } from "./interaction-actions";
import { linkNetworkLeadTask, saveNetworkLead } from "./lead-actions";
import { getNetworkContact, listNetworkFollowUps } from "./queries";

const aaron = { id: "aaron", role: "member" };
const colleague = { id: "colleague", role: "member" };
const as = (viewer: { id: string; role: string }) => auth.requireUserOrThrow.mockResolvedValue(viewer);

async function capture(input: Parameters<typeof quickCaptureContact>[0]) {
  const result = await quickCaptureContact(input);
  if (!result.ok) throw new Error(result.error);
  return result.contactId;
}
const lastContact = (id: string) => db.select().from(networkContacts).where(eq(networkContacts.id, id)).get()?.lastContactOn;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // 21:30 UTC is 23:30 in Vienna: still the 27th there.
  vi.setSystemTime(new Date("2026-09-27T21:30:00Z"));
  db.delete(tasks).run();
  db.delete(networkContacts).run();
  db.delete(networkTags).run();
  db.delete(networkOrganizations).run();
  db.delete(user).run();
  const now = new Date();
  db.insert(user).values([aaron, colleague].map((viewer) => ({
    id: viewer.id, name: viewer.id, email: `${viewer.id}@example.com`, role: viewer.role, createdAt: now, updatedAt: now,
  }))).run();
  as(aaron);
});
afterAll(() => {
  vi.useRealTimers();
  sqlite.close();
});

describe("interaction log", () => {
  it("logs today's conversation from quick capture and the 'spoke today' button, in Vienna time", async () => {
    const id = await capture({ name: "Sebastian", metToday: true });
    expect(getNetworkContact(aaron, id)!.interactions).toMatchObject([{ occurredOn: "2026-09-27", channel: "meeting" }]);
    expect(lastContact(id)).toBe("2026-09-27");

    // A second note after the same conversation does not log it twice.
    await capture({ contactId: id, note: "Noch etwas", metToday: true });
    expect(getNetworkContact(aaron, id)!.interactions).toHaveLength(1);

    const other = await capture({ name: "Anna" });
    expect(lastContact(other)).toBeNull();
    expect(await markNetworkContactContacted(other)).toEqual({ ok: true });
    expect(lastContact(other)).toBe("2026-09-27");
  });

  it("moves the last-contact date forward only, and falls back when its entry is removed", async () => {
    const id = await capture({ name: "Felix" });
    const recent = await addNetworkInteraction({ contactId: id, occurredOn: "2026-09-20", channel: "call", note: "Intro besprochen" });
    await addNetworkInteraction({ contactId: id, occurredOn: "2026-08-01", channel: "event" });
    expect(lastContact(id)).toBe("2026-09-20");
    expect(getNetworkContact(aaron, id)!.interactions.map((entry) => entry.occurredOn)).toEqual(["2026-09-20", "2026-08-01"]);

    expect(recent.ok && await deleteNetworkInteraction(recent.id)).toEqual({ ok: true });
    expect(lastContact(id)).toBe("2026-08-01");
  });

  it("keeps a last-contact date entered by hand when an unrelated entry is removed", async () => {
    const id = await capture({ name: "Christoph" });
    const entry = await addNetworkInteraction({ contactId: id, occurredOn: "2026-05-01" });
    await updateNetworkContact({ id, name: "Christoph", lastContactOn: "2026-09-01" });
    expect(entry.ok && await deleteNetworkInteraction(entry.id)).toEqual({ ok: true });
    expect(lastContact(id)).toBe("2026-09-01");
  });

  it("rejects invalid dates and hides private history from others", async () => {
    const id = await capture({ name: "Private", metToday: true });
    expect(await addNetworkInteraction({ contactId: id, occurredOn: "2026-13-01" })).toEqual({ ok: false, error: "invalid" });
    const [entry] = getNetworkContact(aaron, id)!.interactions;
    as(colleague);
    expect(await addNetworkInteraction({ contactId: id, occurredOn: "2026-09-01" })).toEqual({ ok: false, error: "notFound" });
    expect(await deleteNetworkInteraction(entry.id)).toEqual({ ok: false, error: "notFound" });
  });
});

describe("editing an interaction", () => {
  async function log(contactId: string, occurredOn: string, note = "") {
    const result = await addNetworkInteraction({ contactId, occurredOn, channel: "call", note });
    if (!result.ok) throw new Error(result.error);
    return result.id;
  }
  const move = (id: string, occurredOn: string) => updateNetworkInteraction({ id, occurredOn, channel: "call", note: "" });

  it("moves the last-contact date forward when an entry is moved later", async () => {
    const id = await capture({ name: "Felix" });
    const entry = await log(id, "2026-08-01");
    await log(id, "2026-09-01");
    expect(await move(entry, "2026-09-15")).toEqual({ ok: true });
    expect(lastContact(id)).toBe("2026-09-15");
  });

  it("falls back when the latest entry is moved earlier, and ignores older entries moving back", async () => {
    const id = await capture({ name: "Anna" });
    const older = await log(id, "2026-08-01");
    const latest = await log(id, "2026-09-20");
    expect(await move(older, "2026-07-01")).toEqual({ ok: true });
    expect(lastContact(id)).toBe("2026-09-20");

    // Moved below another entry: that one becomes the latest.
    await log(id, "2026-09-01");
    expect(await move(latest, "2026-06-01")).toEqual({ ok: true });
    expect(lastContact(id)).toBe("2026-09-01");
  });

  it("keeps the latest entry's new date when it is still the latest after moving back", async () => {
    const id = await capture({ name: "Sebastian" });
    await log(id, "2026-08-01");
    const latest = await log(id, "2026-09-20");
    expect(await move(latest, "2026-09-10")).toEqual({ ok: true });
    expect(lastContact(id)).toBe("2026-09-10");
  });

  it("keeps the date when another entry shares it", async () => {
    const id = await capture({ name: "Tie" });
    const first = await log(id, "2026-09-20");
    await log(id, "2026-09-20");
    await log(id, "2026-08-01");
    expect(await move(first, "2026-07-01")).toEqual({ ok: true });
    expect(lastContact(id)).toBe("2026-09-20");
  });

  it("leaves a later date entered by hand alone", async () => {
    const id = await capture({ name: "Christoph" });
    const entry = await log(id, "2026-05-01");
    await updateNetworkContact({ id, name: "Christoph", lastContactOn: "2026-09-25" });
    expect(await move(entry, "2026-06-01")).toEqual({ ok: true });
    expect(lastContact(id)).toBe("2026-09-25");
    expect(await move(entry, "2026-04-01")).toEqual({ ok: true });
    expect(lastContact(id)).toBe("2026-09-25");
  });

  it("updates the row in place, keeping its id, contact and author", async () => {
    const id = await capture({ name: "Team" });
    await setNetworkContactVisibility({ contactId: id, visibility: "team" });
    const entry = await log(id, "2026-09-01", "Erstgespräch");
    as(colleague);
    expect(await updateNetworkInteraction({ id: entry, occurredOn: "2026-09-02", channel: "email", note: "Nachfass-Mail" })).toEqual({ ok: true });
    const rows = db.select().from(networkInteractions).where(eq(networkInteractions.contactId, id)).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: entry, contactId: id, createdBy: "aaron", occurredOn: "2026-09-02", channel: "email", note: "Nachfass-Mail" });
  });

  it("cannot reparent an entry through extra input", async () => {
    const id = await capture({ name: "Mine" });
    const other = await capture({ name: "Other" });
    const entry = await log(id, "2026-09-01");
    const input = { id: entry, occurredOn: "2026-09-02", channel: "call", note: "", contactId: other } as Parameters<typeof updateNetworkInteraction>[0];
    expect(await updateNetworkInteraction(input)).toEqual({ ok: true });
    expect(db.select().from(networkInteractions).where(eq(networkInteractions.id, entry)).get()?.contactId).toBe(id);
    expect(lastContact(other)).toBeNull();
  });

  it("rejects invalid input and hides missing or private entries", async () => {
    const id = await capture({ name: "Private" });
    const entry = await log(id, "2026-09-01", "geheim");
    expect(await updateNetworkInteraction({ id: entry, occurredOn: "2026-02-30" })).toEqual({ ok: false, error: "invalid" });
    expect(await updateNetworkInteraction({ id: "missing", occurredOn: "2026-09-01" })).toEqual({ ok: false, error: "notFound" });
    as(colleague);
    expect(await updateNetworkInteraction({ id: entry, occurredOn: "2026-09-02", note: "x" })).toEqual({ ok: false, error: "notFound" });
    as(aaron);
    expect(getNetworkContact(aaron, id)!.interactions).toMatchObject([{ occurredOn: "2026-09-01", note: "geheim" }]);
  });
});

describe("lead tasks", () => {
  it("links a task to a lead and shows its status", async () => {
    const id = await capture({ name: "Felix", note: "Freund kennt Förderungen", kind: "intro" });
    const [lead] = getNetworkContact(aaron, id)!.leads;
    const task = db.insert(tasks).values({ title: "Felix wegen Intro fragen", createdBy: "aaron" }).returning().get();

    expect(await linkNetworkLeadTask({ leadId: lead.id, taskId: task.id })).toEqual({ ok: true });
    expect(getNetworkContact(aaron, id)!.leads[0].task).toEqual({ id: task.id, title: "Felix wegen Intro fragen", status: "open", projectId: null });

    // Deleting the task only unlinks it.
    db.delete(tasks).where(eq(tasks.id, task.id)).run();
    expect(getNetworkContact(aaron, id)!.leads[0].task).toBeNull();
  });

  it("refuses links to missing tasks or private contacts of others", async () => {
    const id = await capture({ name: "Anna", note: "Design" });
    const [lead] = getNetworkContact(aaron, id)!.leads;
    expect(await linkNetworkLeadTask({ leadId: lead.id, taskId: "missing" })).toEqual({ ok: false, error: "invalid" });
    const task = db.insert(tasks).values({ title: "x", createdBy: "colleague" }).returning().get();
    as(colleague);
    expect(await linkNetworkLeadTask({ leadId: lead.id, taskId: task.id })).toEqual({ ok: false, error: "notFound" });
  });
});

describe("dashboard follow-ups", () => {
  it("shows leads on own contacts plus own leads on others' team contacts", async () => {
    await capture({ name: "Mine", note: "my lead" });
    as(colleague);
    const shared = await capture({ name: "Shared", note: "colleague's lead" });
    await setNetworkContactVisibility({ contactId: shared, visibility: "team" });
    as(aaron);
    await saveNetworkLead({ contactId: shared, summary: "my lead on a team contact", dueOn: "2026-09-01" });

    const { leads, total } = listNetworkFollowUps(aaron);
    expect(total).toBe(2);
    expect(leads.map((lead) => lead.summary)).toEqual(["my lead on a team contact", "my lead"]);
    // The colleague owns the shared contact, so every lead on it is theirs to follow up; "Mine" stays private.
    expect(listNetworkFollowUps(colleague).leads.map((lead) => lead.summary)).toEqual(["my lead on a team contact", "colleague's lead"]);
  });
});
