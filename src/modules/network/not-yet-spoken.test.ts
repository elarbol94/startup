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
import { networkContacts, networkInteractions, networkOrganizations, networkTags, user } from "@/db/schema";
import { markNetworkContactContacted, quickCaptureContact, updateNetworkContact } from "./contact-actions";
import { addNetworkInteraction, deleteNetworkInteraction, updateNetworkInteraction } from "./interaction-actions";

const aaron = { id: "aaron", role: "member" };

async function capture(input: Parameters<typeof quickCaptureContact>[0]) {
  const result = await quickCaptureContact(input);
  if (!result.ok) throw new Error(result.error);
  return result.contactId;
}
const stored = (id: string) => db.select().from(networkContacts).where(eq(networkContacts.id, id)).get()!;
const notYetSpoken = (id: string) => stored(id).notYetSpoken;
/** A contact created as "not spoken yet" through quick capture. */
const unspoken = (name: string) => capture({ name, metToday: false, notYetSpoken: true });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-27T10:00:00Z"));
  db.delete(networkContacts).run();
  db.delete(networkTags).run();
  db.delete(networkOrganizations).run();
  db.delete(user).run();
  const now = new Date();
  db.insert(user).values({ id: aaron.id, name: aaron.id, email: "aaron@example.com", role: aaron.role, createdAt: now, updatedAt: now }).run();
  auth.requireUserOrThrow.mockResolvedValue(aaron);
});
afterAll(() => {
  vi.useRealTimers();
  sqlite.close();
});

describe("not spoken yet: quick capture", () => {
  it("marks a new contact, without logging a conversation", async () => {
    const id = await unspoken("Sebastian");
    expect(stored(id)).toMatchObject({ notYetSpoken: true, lastContactOn: null });
    expect(db.select().from(networkInteractions).where(eq(networkInteractions.contactId, id)).all()).toHaveLength(0);
  });

  it("defaults to false", async () => {
    expect(notYetSpoken(await capture({ name: "Anna" }))).toBe(false);
  });

  it("rejects 'met today' and 'not spoken yet' together", async () => {
    expect(await quickCaptureContact({ name: "Both", metToday: true, notYetSpoken: true })).toEqual({ ok: false, error: "invalid" });
    expect(db.select().from(networkContacts).all()).toHaveLength(0);
  });

  it("ignores the flag when adding to an existing contact", async () => {
    const id = await capture({ name: "Anna", metToday: false });
    await capture({ contactId: id, note: "Kennt jemanden", metToday: false, notYetSpoken: true });
    expect(notYetSpoken(id)).toBe(false);
  });

  it("clears the flag of an existing contact when 'met today' is ticked", async () => {
    const id = await unspoken("Clara");
    await capture({ contactId: id, note: "Getroffen", metToday: true });
    expect(stored(id)).toMatchObject({ notYetSpoken: false, lastContactOn: "2026-09-27" });
  });
});

describe("not spoken yet: cleared automatically", () => {
  it("when a conversation is logged", async () => {
    const id = await unspoken("Felix");
    expect(await addNetworkInteraction({ contactId: id, occurredOn: "2026-09-01", channel: "call" })).toMatchObject({ ok: true });
    expect(notYetSpoken(id)).toBe(false);
  });

  it("when the contact is marked contacted", async () => {
    const id = await unspoken("Dora");
    expect(await markNetworkContactContacted(id)).toEqual({ ok: true });
    expect(notYetSpoken(id)).toBe(false);
  });

  it("when a conversation is edited, with or without a new date", async () => {
    const id = await unspoken("Emil");
    const entry = await addNetworkInteraction({ contactId: id, occurredOn: "2026-09-01" });
    if (!entry.ok) throw new Error(entry.error);
    // Ticked again by hand after the conversation was logged.
    await updateNetworkContact({ id, name: "Emil", lastContactOn: "2026-09-01", notYetSpoken: true });
    expect(await updateNetworkInteraction({ id: entry.id, occurredOn: "2026-09-01", channel: "call", note: "Korrektur" })).toEqual({ ok: true });
    expect(notYetSpoken(id)).toBe(false);

    await updateNetworkContact({ id, name: "Emil", lastContactOn: "2026-09-01", notYetSpoken: true });
    expect(await updateNetworkInteraction({ id: entry.id, occurredOn: "2026-09-05", channel: "call", note: "" })).toEqual({ ok: true });
    expect(notYetSpoken(id)).toBe(false);
  });

  it("is never set again when conversations are removed", async () => {
    const id = await unspoken("Gerda");
    const entry = await addNetworkInteraction({ contactId: id, occurredOn: "2026-09-01" });
    if (!entry.ok) throw new Error(entry.error);
    expect(await deleteNetworkInteraction(entry.id)).toEqual({ ok: true });
    expect(stored(id)).toMatchObject({ notYetSpoken: false, lastContactOn: null });
  });
});

describe("not spoken yet: contact edit", () => {
  it("stores the checkbox as submitted, even together with a last-contact date", async () => {
    const id = await capture({ name: "Hanna", metToday: false });
    expect(await updateNetworkContact({ id, name: "Hanna", notYetSpoken: true })).toEqual({ ok: true });
    expect(notYetSpoken(id)).toBe(true);
    // The user's explicit choice wins over the date.
    expect(await updateNetworkContact({ id, name: "Hanna", lastContactOn: "2026-09-20", notYetSpoken: true })).toEqual({ ok: true });
    expect(stored(id)).toMatchObject({ notYetSpoken: true, lastContactOn: "2026-09-20" });
    expect(await updateNetworkContact({ id, name: "Hanna", notYetSpoken: false })).toEqual({ ok: true });
    expect(notYetSpoken(id)).toBe(false);
  });

  it("rejects a non-boolean value", async () => {
    const id = await capture({ name: "Ida" });
    expect(await updateNetworkContact({ id, name: "Ida", notYetSpoken: "yes" as unknown as boolean })).toEqual({ ok: false, error: "invalid" });
  });
});
