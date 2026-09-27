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
  deleteNetworkContact,
  quickCaptureContact,
  setNetworkContactTags,
  setNetworkContactVisibility,
  updateNetworkContact,
} from "./contact-actions";
import { saveNetworkLead, setNetworkLeadStatus } from "./lead-actions";
import { getNetworkContact, listNetworkContacts, listNetworkLeads, listNetworkTagNames } from "./queries";

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

describe("quick capture", () => {
  it("creates a private contact with an open lead and tags", async () => {
    const id = await capture({ name: " Sebastian ", note: "Kennt jemanden beim Klimabündnis Österreich", kind: "intro", metContext: "Party", tags: ["Nachhaltigkeit", "gemeinden"] });
    const contact = getNetworkContact(aaron, id)!;
    expect(contact).toMatchObject({ name: "Sebastian", ownerId: "aaron", visibility: "private", metContext: "Party", isOwn: true, canManage: true });
    expect(contact.tags.map((tag) => tag.name)).toEqual(["gemeinden", "Nachhaltigkeit"]);
    expect(contact.leads).toMatchObject([{ kind: "intro", status: "open", summary: "Kennt jemanden beim Klimabündnis Österreich" }]);
  });

  it("adds to an existing contact and merges tags instead of replacing them", async () => {
    const id = await capture({ name: "Anna", tags: ["Design"] });
    await capture({ contactId: id, note: "Hilft beim Branding", kind: "help", tags: ["design", "Website"] });
    const contact = getNetworkContact(aaron, id)!;
    expect(contact.tags.map((tag) => tag.name)).toEqual(["Design", "Website"]);
    expect(contact.leads.map((lead) => lead.summary)).toEqual(["Hilft beim Branding"]);
    expect(db.select().from(networkContacts).all()).toHaveLength(1);
  });

  it("rejects a capture without a name or contact", async () => {
    expect(await quickCaptureContact({ name: "  ", note: "something" })).toEqual({ ok: false, error: "invalid" });
  });
});

describe("visibility", () => {
  it("hides private contacts from everyone else, admins included", async () => {
    const id = await capture({ name: "Christoph", note: "Hat selbst gegründet", kind: "advice" });
    for (const viewer of [colleague, admin]) {
      expect(getNetworkContact(viewer, id)).toBeNull();
      expect(listNetworkContacts(viewer).contacts).toEqual([]);
      expect(listNetworkLeads(viewer)).toEqual([]);
      as(viewer);
      expect(await updateNetworkContact({ id, name: "Hacked" })).toEqual({ ok: false, error: "notFound" });
      expect(await quickCaptureContact({ contactId: id, note: "x" })).toEqual({ ok: false, error: "notFound" });
      expect(await deleteNetworkContact(id)).toEqual({ ok: false, error: "notFound" });
    }
    expect(db.select().from(networkContacts).where(eq(networkContacts.id, id)).get()?.name).toBe("Christoph");
  });

  it("lets the team edit a shared contact, but only the owner or an admin manage it", async () => {
    const id = await capture({ name: "Felix", note: "Freund kennt die Förderlandschaft", kind: "intro" });
    expect(await setNetworkContactVisibility({ contactId: id, visibility: "team" })).toEqual({ ok: true });

    as(colleague);
    expect(getNetworkContact(colleague, id)).toMatchObject({ isOwn: false, canEdit: true, canManage: false });
    expect(await updateNetworkContact({ id, name: "Felix", organization: "TU Graz" })).toEqual({ ok: true });
    const [lead] = listNetworkLeads(colleague);
    expect(await setNetworkLeadStatus({ id: lead.id, status: "asked" })).toEqual({ ok: true });
    expect(await setNetworkContactVisibility({ contactId: id, visibility: "private" })).toEqual({ ok: false, error: "forbidden" });
    expect(await deleteNetworkContact(id)).toEqual({ ok: false, error: "forbidden" });

    as(admin);
    expect(await setNetworkContactVisibility({ contactId: id, visibility: "private" })).toEqual({ ok: true });
    expect(getNetworkContact(admin, id)).toBeNull();
  });

  it("only suggests tags from contacts the viewer can see", async () => {
    await capture({ name: "Private", tags: ["Secret"] });
    const shared = await capture({ name: "Shared", tags: ["Design"] });
    await setNetworkContactVisibility({ contactId: shared, visibility: "team" });
    expect(listNetworkTagNames(colleague)).toEqual(["Design"]);
  });
});

describe("leads and introductions", () => {
  it("refuses to link an introduced contact the viewer cannot see", async () => {
    const felix = await capture({ name: "Felix" });
    as(colleague);
    const hidden = await capture({ name: "Colleague's private friend" });
    as(aaron);
    expect(await saveNetworkLead({ contactId: felix, summary: "Intro", targetContactId: hidden })).toEqual({ ok: false, error: "invalid" });
    expect(await saveNetworkLead({ contactId: felix, summary: "Intro", targetContactId: felix })).toEqual({ ok: false, error: "invalid" });
  });

  it("keeps the introduced person's name when their contact is deleted", async () => {
    const felix = await capture({ name: "Felix" });
    const expert = await capture({ name: "Maria Förder" });
    const saved = await saveNetworkLead({ contactId: felix, kind: "intro", summary: "Freund kennt Förderungen", targetContactId: expert });
    expect(saved.ok).toBe(true);
    expect(getNetworkContact(aaron, expert)!.introducedBy.map((lead) => lead.contactName)).toEqual(["Felix"]);

    expect(await deleteNetworkContact(expert)).toEqual({ ok: true });
    const [lead] = getNetworkContact(aaron, felix)!.leads;
    expect(lead).toMatchObject({ targetName: "Maria Förder", targetContact: null });
  });

  it("does not move a lead to another contact on update", async () => {
    const a = await capture({ name: "A", note: "lead" });
    const b = await capture({ name: "B" });
    const [lead] = getNetworkContact(aaron, a)!.leads;
    expect(await saveNetworkLead({ id: lead.id, contactId: b, summary: "moved" })).toEqual({ ok: false, error: "invalid" });
    expect(db.select().from(networkLeads).where(eq(networkLeads.id, lead.id)).get()?.contactId).toBe(a);
  });
});

describe("contacts", () => {
  it("drops tags that no contact uses any more", async () => {
    const id = await capture({ name: "Anna", tags: ["Design", "Branding"] });
    expect(await setNetworkContactTags({ contactId: id, tags: ["Design"] })).toEqual({ ok: true });
    expect(db.select({ name: networkTags.name }).from(networkTags).all()).toEqual([{ name: "Design" }]);
    expect(await deleteNetworkContact(id)).toEqual({ ok: true });
    expect(db.select().from(networkTags).all()).toEqual([]);
  });

  it("validates dates, email and link schemes", async () => {
    const id = await capture({ name: "Anna" });
    expect(await updateNetworkContact({ id, name: "Anna", lastContactOn: "2026-02-30" })).toEqual({ ok: false, error: "invalid" });
    expect(await updateNetworkContact({ id, name: "Anna", email: "not-an-email" })).toEqual({ ok: false, error: "invalid" });
    expect(await updateNetworkContact({ id, name: "Anna", linkedinUrl: "javascript:alert(1)" })).toEqual({ ok: false, error: "invalid" });
    expect(await updateNetworkContact({ id, name: "Anna", linkedinUrl: "https://www.linkedin.com/in/anna", lastContactOn: "2026-09-27" })).toEqual({ ok: true });
  });

  it("searches across notes, leads and tags, ignoring accents", async () => {
    await capture({ name: "Sebastian", note: "Kennt jemanden beim Klimabündnis", kind: "intro" });
    await capture({ name: "Anna", tags: ["Design"] });
    expect(listNetworkContacts(aaron, { query: "klimabundnis" }).contacts.map((contact) => contact.name)).toEqual(["Sebastian"]);
    expect(listNetworkContacts(aaron, { query: "design" }).contacts.map((contact) => contact.name)).toEqual(["Anna"]);
    const tagId = listNetworkContacts(aaron).tags[0].id;
    expect(listNetworkContacts(aaron, { tagId }).contacts.map((contact) => contact.name)).toEqual(["Anna"]);
  });
});
