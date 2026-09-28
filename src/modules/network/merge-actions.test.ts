import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const auth = vi.hoisted(() => ({ requireUserOrThrow: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => auth);
vi.mock("next-intl/server", async () => {
  const { createFormatter, createTranslator } = await import("next-intl");
  const { default: messages } = await import("../../../messages/en.json");
  return {
    getTranslations: async (namespace: "network") => createTranslator({ locale: "en", messages, namespace }),
    getFormatter: async () => createFormatter({ locale: "en" }),
  };
});
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

import { revalidatePath } from "next/cache";
import { db, sqlite } from "@/db";
import {
  networkContactLinks,
  networkContacts,
  networkContactTags,
  networkInteractions,
  networkLeads,
  networkOrganizations,
  networkTags,
  projects,
  tasks,
  user,
  wikiPages,
} from "@/db/schema";
import { localDateInZone } from "@/modules/calendar/date-utils";
import { TIME_ZONE } from "@/modules/time/lib/entry-time";
import { getNetworkContactMergePreview, mergeNetworkContacts } from "./merge-actions";
import { listMergeCandidates } from "./merge-helpers";

const aaron = { id: "aaron", role: "member" };
const colleague = { id: "colleague", role: "member" };
const admin = { id: "admin", role: "admin" };
const as = (viewer: { id: string; role: string }) => auth.requireUserOrThrow.mockResolvedValue(viewer);

type NewContact = typeof networkContacts.$inferInsert;
const contact = (id: string, values: Partial<NewContact> = {}) =>
  db.insert(networkContacts).values({ id, ownerId: "aaron", name: id, ...values }).returning().get();
const row = (id: string) => db.select().from(networkContacts).where(eq(networkContacts.id, id)).get();
const tag = (contactId: string, name: string) => {
  const normalizedName = name.toLowerCase();
  const existing = db.select().from(networkTags).where(eq(networkTags.normalizedName, normalizedName)).get();
  const tagId = existing?.id ?? db.insert(networkTags).values({ name, normalizedName, createdBy: "aaron" }).returning().get().id;
  db.insert(networkContactTags).values({ contactId, tagId }).run();
};
const tagNames = (contactId: string) => db
  .select({ name: networkTags.name })
  .from(networkContactTags)
  .innerJoin(networkTags, eq(networkTags.id, networkContactTags.tagId))
  .where(eq(networkContactTags.contactId, contactId))
  .all()
  .map((entry) => entry.name)
  .sort();
/** The merge note's date as the English formatter writes it, e.g. "Sep 28, 2026". */
const today = () => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${localDateInZone(new Date(), TIME_ZONE)}T12:00:00Z`));

beforeEach(() => {
  db.delete(networkContacts).run();
  db.delete(networkTags).run();
  db.delete(networkOrganizations).run();
  db.delete(tasks).run();
  db.delete(wikiPages).run();
  db.delete(projects).run();
  db.delete(user).run();
  const now = new Date();
  db.insert(user).values([aaron, colleague, admin].map((viewer) => ({
    id: viewer.id, name: viewer.id, email: `${viewer.id}@example.com`, role: viewer.role, createdAt: now, updatedAt: now,
  }))).run();
  as(aaron);
  vi.mocked(revalidatePath).mockClear();
});
afterAll(() => sqlite.close());

describe("merge access", () => {
  const pair = { keepId: "keep", mergeId: "merge" };

  it("lets the owner merge two private contacts", async () => {
    contact("keep");
    contact("merge");
    expect((await getNetworkContactMergePreview(pair)).ok).toBe(true);
    expect(await mergeNetworkContacts(pair)).toEqual({ ok: true, contactId: "keep" });
    expect(row("merge")).toBeUndefined();
    expect(revalidatePath).toHaveBeenCalledWith("/network", "layout");
  });

  it("lets the owner, or an admin, merge two team contacts", async () => {
    contact("keep", { visibility: "team" });
    contact("merge", { visibility: "team" });
    expect(await mergeNetworkContacts(pair)).toMatchObject({ ok: true });

    contact("a", { visibility: "team", ownerId: "colleague" });
    contact("b", { visibility: "team" });
    as(admin);
    expect(await mergeNetworkContacts({ keepId: "a", mergeId: "b" })).toMatchObject({ ok: true });
    // The survivor keeps its owner and visibility.
    expect(row("a")).toMatchObject({ ownerId: "colleague", visibility: "team" });
  });

  it("answers notFound for someone else's private contact, on either side", async () => {
    contact("keep");
    contact("merge", { ownerId: "colleague" });
    expect(await getNetworkContactMergePreview(pair)).toEqual({ ok: false, error: "notFound" });
    expect(await mergeNetworkContacts(pair)).toEqual({ ok: false, error: "notFound" });
    expect(await mergeNetworkContacts({ keepId: "merge", mergeId: "keep" })).toEqual({ ok: false, error: "notFound" });
    // Even an admin cannot see private contacts, and notFound wins over forbidden.
    as(admin);
    expect(await mergeNetworkContacts(pair)).toEqual({ ok: false, error: "notFound" });
    expect(row("keep")).toBeDefined();
    expect(row("merge")).toBeDefined();
  });

  it("refuses team contacts the viewer cannot manage", async () => {
    contact("keep", { visibility: "team", ownerId: "colleague" });
    contact("merge", { visibility: "team" });
    expect(await mergeNetworkContacts(pair)).toEqual({ ok: false, error: "forbidden" });
  });

  it("refuses to merge a private with a team contact", async () => {
    contact("keep");
    contact("merge", { visibility: "team" });
    expect(await getNetworkContactMergePreview(pair)).toEqual({ ok: false, error: "visibilityMismatch" });
    expect(await mergeNetworkContacts(pair)).toEqual({ ok: false, error: "visibilityMismatch" });
    expect(row("merge")).toBeDefined();
  });

  it("refuses a contact merged with itself and malformed choices", async () => {
    contact("keep");
    contact("merge");
    expect(await mergeNetworkContacts({ keepId: "keep", mergeId: "keep" })).toEqual({ ok: false, error: "invalid" });
    expect(await getNetworkContactMergePreview({ keepId: "keep", mergeId: "keep" })).toEqual({ ok: false, error: "invalid" });
    // @ts-expect-error unknown field
    expect(await mergeNetworkContacts({ ...pair, choices: { ownerId: "merge" } })).toEqual({ ok: false, error: "invalid" });
  });

  it("offers only manageable contacts with the same visibility", () => {
    contact("keep");
    contact("other");
    contact("shared", { visibility: "team" });
    contact("theirs", { ownerId: "colleague" });
    const keep = row("keep")!;
    expect(listMergeCandidates(keep, aaron).map((entry) => entry.id)).toEqual(["other"]);
    expect(listMergeCandidates(keep, colleague)).toEqual([]);
  });
});

describe("merging contacts", () => {
  function organization(id: string, name: string) {
    db.insert(networkOrganizations).values({ id, name, normalizedName: name.toLowerCase(), createdBy: "aaron" }).run();
  }

  it("applies the chosen values, fills empty fields and keeps discarded values in the notes", async () => {
    organization("kb", "Klimabündnis");
    organization("sfg", "SFG");
    contact("keep", {
      name: "Maria Huber", email: "maria@kb.at", organization: "Klimabündnis", organizationId: "kb", relationship: "friend",
      municipalityCode: "61108", municipalityName: "Leoben", reconnectEveryDays: 30, notes: "Kennt Lukas.",
    });
    contact("merge", {
      name: "Maria Hueber", email: "maria@sfg.at", phone: "+43 660 1234", organization: "SFG", organizationId: "sfg", relationship: "professional",
      municipalityCode: "61120", municipalityName: "Trofaiach", reconnectEveryDays: 90, notes: "Arbeitet bei der SFG.",
    });

    const preview = await getNetworkContactMergePreview({ keepId: "keep", mergeId: "merge" });
    if (!preview.ok) throw new Error(preview.error);
    expect(preview.preview.conflicts).toEqual([
      { key: "name", keep: "Maria Huber", merge: "Maria Hueber" },
      { key: "email", keep: "maria@kb.at", merge: "maria@sfg.at" },
      { key: "relationship", keep: "friend", merge: "professional" },
      { key: "reconnectEveryDays", keep: "30", merge: "90" },
      { key: "organization", keep: "Klimabündnis", merge: "SFG" },
      { key: "municipality", keep: "Leoben", merge: "Trofaiach" },
    ]);
    expect(preview.preview.filled).toEqual(["phone"]);
    expect(preview.preview.blockers).toEqual([]);

    const result = await mergeNetworkContacts({
      keepId: "keep", mergeId: "merge",
      choices: { email: "merge", organization: "merge", municipality: "merge", reconnectEveryDays: "merge", name: "keep" },
    });
    expect(result).toEqual({ ok: true, contactId: "keep" });
    const merged = row("keep")!;
    expect(merged).toMatchObject({
      name: "Maria Huber", email: "maria@sfg.at", phone: "+43 660 1234", organization: "SFG", organizationId: "sfg", relationship: "friend",
      municipalityCode: "61120", municipalityName: "Trofaiach", reconnectEveryDays: 90, ownerId: "aaron", visibility: "private",
    });
    expect(merged.notes).toBe([
      "Kennt Lukas.",
      "",
      `Merged from Maria Hueber on ${today()}: Name: Maria Hueber, Email: maria@kb.at, Relationship: Professional, `
        + "Keep in touch: Every 30 days, Organisation: Klimabündnis, Lives in: Leoben",
      "Arbeitet bei der SFG.",
    ].join("\n"));
    // The organisation nobody refers to any more is tidied up.
    expect(db.select({ id: networkOrganizations.id }).from(networkOrganizations).all()).toEqual([{ id: "sfg" }]);
  });

  it("leaves the notes alone when nothing is discarded", async () => {
    contact("keep", { name: "Maria", notes: "Nur hier.", email: "a@example.com" });
    contact("merge", { name: "Maria", email: "a@example.com", phone: "+43 1" });
    await mergeNetworkContacts({ keepId: "keep", mergeId: "merge" });
    expect(row("keep")).toMatchObject({ notes: "Nur hier.", phone: "+43 1" });
  });

  it("refuses notes over the limit instead of truncating them", async () => {
    contact("keep", { notes: "a".repeat(15_000) });
    contact("merge", { notes: "b".repeat(5_000) });
    const preview = await getNetworkContactMergePreview({ keepId: "keep", mergeId: "merge" });
    expect(preview.ok && preview.preview.blockers).toEqual(["notesTooLong"]);
    expect(await mergeNetworkContacts({ keepId: "keep", mergeId: "merge" })).toEqual({ ok: false, error: "notesTooLong" });
    expect(row("merge")).toBeDefined();
    expect(row("keep")!.notes).toHaveLength(15_000);
  });

  it("refuses more tags than a contact may have, counting shared tags once", async () => {
    contact("keep");
    contact("merge");
    for (let index = 0; index < 12; index += 1) tag("keep", `k${index}`);
    for (let index = 0; index < 8; index += 1) tag("merge", `k${index}`);
    tag("merge", "m1");
    tag("merge", "m2");
    const preview = await getNetworkContactMergePreview({ keepId: "keep", mergeId: "merge" });
    expect(preview.ok && preview.preview.counts.tags).toBe(2);
    expect(await mergeNetworkContacts({ keepId: "keep", mergeId: "merge" })).toMatchObject({ ok: true });
    expect(tagNames("keep")).toHaveLength(14);

    contact("full");
    contact("more");
    for (let index = 0; index < 15; index += 1) tag("full", `f${index}`);
    for (let index = 0; index < 6; index += 1) tag("more", `x${index}`);
    expect(await mergeNetworkContacts({ keepId: "full", mergeId: "more" })).toEqual({ ok: false, error: "tooManyTags" });
    expect(tagNames("more")).toHaveLength(6);
  });

  it("moves leads, conversations and introductions and drops self-introductions in both directions", async () => {
    contact("keep");
    contact("merge", { lastContactOn: "2026-05-01" });
    contact("felix");
    const task = db.insert(tasks).values({ title: "Maria fragen", createdBy: "aaron" }).returning().get();
    const createdAt = new Date("2026-01-02T10:00:00Z");
    const own = db.insert(networkLeads).values({ contactId: "merge", summary: "Hilft beim Branding", taskId: task.id, createdBy: "colleague", createdAt }).returning().get();
    const toKeep = db.insert(networkLeads).values({ contactId: "merge", summary: "Stellt uns vor", targetContactId: "keep", createdBy: "aaron" }).returning().get();
    const toMerge = db.insert(networkLeads).values({ contactId: "keep", summary: "Kennt jemanden", targetContactId: "merge", createdBy: "aaron" }).returning().get();
    const intro = db.insert(networkLeads).values({ contactId: "felix", summary: "Kann Maria vorstellen", targetContactId: "merge", createdBy: "aaron" }).returning().get();
    const talk = db.insert(networkInteractions).values({ contactId: "merge", occurredOn: "2026-05-01", note: "Kaffee", createdBy: "colleague" }).returning().get();

    const preview = await getNetworkContactMergePreview({ keepId: "keep", mergeId: "merge" });
    expect(preview.ok && preview.preview.counts).toEqual({ leads: 2, introductions: 2, interactions: 1, links: 0, tags: 0 });
    expect(await mergeNetworkContacts({ keepId: "keep", mergeId: "merge" })).toMatchObject({ ok: true });

    const lead = (id: string) => db.select().from(networkLeads).where(eq(networkLeads.id, id)).get()!;
    expect(lead(own.id)).toMatchObject({ contactId: "keep", taskId: task.id, createdBy: "colleague", createdAt });
    expect(lead(toKeep.id)).toMatchObject({ contactId: "keep", targetContactId: null });
    expect(lead(toMerge.id)).toMatchObject({ contactId: "keep", targetContactId: null });
    expect(lead(intro.id)).toMatchObject({ contactId: "felix", targetContactId: "keep" });
    expect(db.select().from(networkInteractions).where(eq(networkInteractions.id, talk.id)).get()).toMatchObject({ contactId: "keep", createdBy: "colleague" });
    expect(row("keep")!.lastContactOn).toBe("2026-05-01");
  });

  it("keeps one link per target and the ids of those that move", async () => {
    contact("keep");
    contact("merge");
    db.insert(projects).values({ id: "pilot", name: "Pilot Leoben", createdBy: "aaron" }).run();
    db.insert(wikiPages).values({ id: "page", title: "Förderlandschaft", slug: "foerderlandschaft", createdBy: "aaron", updatedBy: "aaron" }).run();
    const kept = db.insert(networkContactLinks).values({ contactId: "keep", targetType: "project", targetId: "pilot", createdBy: "aaron" }).returning().get();
    db.insert(networkContactLinks).values({ contactId: "merge", targetType: "project", targetId: "pilot", createdBy: "aaron" }).run();
    const moved = db.insert(networkContactLinks).values({ contactId: "merge", targetType: "wikiPage", targetId: "page", createdBy: "colleague" }).returning().get();

    expect(await mergeNetworkContacts({ keepId: "keep", mergeId: "merge" })).toMatchObject({ ok: true });
    const links = db.select().from(networkContactLinks).all().sort((a, b) => a.targetType.localeCompare(b.targetType));
    expect(links.map((link) => [link.id, link.contactId, link.targetType, link.createdBy])).toEqual([
      [kept.id, "keep", "project", "aaron"],
      [moved.id, "keep", "wikiPage", "colleague"],
    ]);
  });

  it("keeps 'not spoken yet' only when neither was spoken to", async () => {
    contact("a", { notYetSpoken: true });
    contact("b", { notYetSpoken: true });
    await mergeNetworkContacts({ keepId: "a", mergeId: "b" });
    expect(row("a")!.notYetSpoken).toBe(true);

    contact("c", { notYetSpoken: true });
    contact("d", { notYetSpoken: true, lastContactOn: "2026-03-01" });
    await mergeNetworkContacts({ keepId: "c", mergeId: "d" });
    expect(row("c")).toMatchObject({ notYetSpoken: false, lastContactOn: "2026-03-01" });

    contact("e", { notYetSpoken: true });
    contact("f");
    await mergeNetworkContacts({ keepId: "e", mergeId: "f" });
    expect(row("e")!.notYetSpoken).toBe(false);
  });

  it("changes nothing when the merge fails part-way", async () => {
    contact("keep", { email: "a@example.com" });
    contact("merge", { email: "b@example.com", notes: "Wichtig" });
    tag("merge", "Design");
    const lead = db.insert(networkLeads).values({ contactId: "merge", summary: "Hilft", createdBy: "aaron" }).returning().get();
    db.insert(networkInteractions).values({ contactId: "merge", occurredOn: "2026-04-01", createdBy: "aaron" }).run();
    sqlite.exec("CREATE TEMP TRIGGER fail_merge BEFORE DELETE ON network_contacts WHEN old.id = 'merge' BEGIN SELECT RAISE(ABORT, 'forced'); END;");
    try {
      await expect(mergeNetworkContacts({ keepId: "keep", mergeId: "merge", choices: { email: "merge" } })).rejects.toThrow("forced");
    } finally {
      sqlite.exec("DROP TRIGGER fail_merge;");
    }
    expect(row("keep")).toMatchObject({ email: "a@example.com", notes: "", lastContactOn: null });
    expect(row("merge")).toMatchObject({ email: "b@example.com", notes: "Wichtig" });
    expect(db.select().from(networkLeads).where(eq(networkLeads.id, lead.id)).get()!.contactId).toBe("merge");
    expect(db.select().from(networkInteractions).all().map((entry) => entry.contactId)).toEqual(["merge"]);
    expect(tagNames("keep")).toEqual([]);
    expect(tagNames("merge")).toEqual(["Design"]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
