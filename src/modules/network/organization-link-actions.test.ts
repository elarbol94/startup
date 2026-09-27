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
import { fundingProjects, networkContacts, networkLeads, networkOrganizations, networkTags, projects, user, wikiPages } from "@/db/schema";
import { deleteNetworkContact, quickCaptureContact, setNetworkContactVisibility, updateNetworkContact } from "./contact-actions";
import { saveNetworkLead } from "./lead-actions";
import { linkNetworkContact, searchNetworkLinkTargets, unlinkNetworkContact } from "./link-actions";
import { listLinkedNetworkContacts } from "./link-queries";
import { updateNetworkOrganization } from "./organization-actions";
import { getNetworkOrganization, listNetworkOrganizations } from "./organization-queries";
import { backfillNetworkOrganizations } from "./organizations";
import { getNetworkContact } from "./queries";

const aaron = { id: "aaron", role: "member" };
const colleague = { id: "colleague", role: "member" };
const as = (viewer: { id: string; role: string }) => auth.requireUserOrThrow.mockResolvedValue(viewer);

async function capture(name: string) {
  const result = await quickCaptureContact({ name });
  if (!result.ok) throw new Error(result.error);
  return result.contactId;
}
const contactRow = (id: string) => db.select().from(networkContacts).where(eq(networkContacts.id, id)).get()!;
const organizationNames = () => db.select({ name: networkOrganizations.name }).from(networkOrganizations).all().map((row) => row.name).sort();

beforeEach(() => {
  db.delete(networkContacts).run();
  db.delete(networkOrganizations).run();
  db.delete(networkTags).run();
  db.delete(wikiPages).run();
  db.delete(fundingProjects).run();
  db.delete(projects).run();
  db.delete(user).run();
  const now = new Date();
  db.insert(user).values([aaron, colleague].map((viewer) => ({
    id: viewer.id, name: viewer.id, email: `${viewer.id}@example.com`, role: viewer.role, createdAt: now, updatedAt: now,
  }))).run();
  as(aaron);
});
afterAll(() => sqlite.close());

describe("organisations", () => {
  it("treats differently typed names as one organisation and keeps its spelling", async () => {
    const maria = await capture("Maria");
    const jonas = await capture("Jonas");
    expect(await updateNetworkContact({ id: maria, name: "Maria", organization: "Klimabündnis Österreich" })).toEqual({ ok: true });
    expect(await updateNetworkContact({ id: jonas, name: "Jonas", organization: "  klimabundnis  osterreich " })).toEqual({ ok: true });
    expect(contactRow(jonas)).toMatchObject({ organization: "Klimabündnis Österreich", organizationId: contactRow(maria).organizationId });
    expect(listNetworkOrganizations(aaron)).toMatchObject([{ name: "Klimabündnis Österreich", people: 2, intros: 0 }]);
  });

  it("drops organisations nobody refers to, unless they carry a website or notes", async () => {
    const id = await capture("Anna");
    await updateNetworkContact({ id, name: "Anna", organization: "Tpyo GmbH" });
    await updateNetworkContact({ id, name: "Anna", organization: "Typo GmbH" });
    expect(organizationNames()).toEqual(["Typo GmbH"]);

    const organizationId = contactRow(id).organizationId!;
    expect(await updateNetworkOrganization({ id: organizationId, name: "Typo GmbH", website: "https://typo.example" })).toEqual({ ok: true });
    await deleteNetworkContact(id);
    expect(organizationNames()).toEqual(["Typo GmbH"]);
  });

  it("renames everywhere and refuses a name another organisation has", async () => {
    const felix = await capture("Felix");
    const sfg = await capture("Sabine");
    await updateNetworkContact({ id: sfg, name: "Sabine", organization: "SFG" });
    await saveNetworkLead({ contactId: felix, kind: "intro", summary: "Kennt jemanden", targetOrganization: "sfg" });
    const organizationId = contactRow(sfg).organizationId!;
    await updateNetworkContact({ id: felix, name: "Felix", organization: "aws" });

    expect(await updateNetworkOrganization({ id: organizationId, name: "AWS" })).toEqual({ ok: false, error: "duplicate" });
    expect(await updateNetworkOrganization({ id: organizationId, name: "Steirische Wirtschaftsförderung SFG" })).toEqual({ ok: true });
    expect(contactRow(sfg).organization).toBe("Steirische Wirtschaftsförderung SFG");
    expect(db.select().from(networkLeads).get()).toMatchObject({ targetOrganization: "Steirische Wirtschaftsförderung SFG", targetOrganizationId: organizationId });
    expect(getNetworkOrganization(aaron, organizationId)!.introductions.map((lead) => lead.contactName)).toEqual(["Felix"]);
  });

  it("only shows organisations and people the viewer can see", async () => {
    const privateId = await capture("Private");
    await updateNetworkContact({ id: privateId, name: "Private", organization: "Klimabündnis" });
    const organizationId = contactRow(privateId).organizationId!;
    expect(getNetworkOrganization(colleague, organizationId)).toBeNull();
    expect(listNetworkOrganizations(colleague)).toEqual([]);
    as(colleague);
    expect(await updateNetworkOrganization({ id: organizationId, name: "Hijacked" })).toEqual({ ok: false, error: "notFound" });

    as(aaron);
    const shared = await capture("Shared");
    await updateNetworkContact({ id: shared, name: "Shared", organization: "Klimabündnis" });
    await setNetworkContactVisibility({ contactId: shared, visibility: "team" });
    expect(getNetworkOrganization(colleague, organizationId)!.people.map((person) => person.name)).toEqual(["Shared"]);
    expect(listNetworkOrganizations(colleague)).toMatchObject([{ name: "Klimabündnis", people: 1 }]);
  });

  it("backfills organisations typed before they existed, idempotently", () => {
    db.insert(networkContacts).values([
      { id: "a", ownerId: "aaron", name: "A", organization: "Stadtgemeinde Leoben" },
      { id: "b", ownerId: "aaron", name: "B", organization: "stadtgemeinde leoben" },
    ]).run();
    db.insert(networkLeads).values({ contactId: "a", summary: "Intro", targetOrganization: "Land Steiermark", createdBy: "aaron" }).run();
    backfillNetworkOrganizations();
    backfillNetworkOrganizations();
    expect(organizationNames()).toEqual(["Land Steiermark", "Stadtgemeinde Leoben"]);
    expect(contactRow("b")).toMatchObject({ organization: "Stadtgemeinde Leoben", organizationId: contactRow("a").organizationId });
    expect(db.select().from(networkLeads).get()?.targetOrganizationId).not.toBeNull();
  });
});

describe("links to projects, funding projects and wiki pages", () => {
  function seedTargets() {
    db.insert(projects).values({ id: "pilot", name: "Pilot Leoben", createdBy: "aaron" }).run();
    db.insert(fundingProjects).values({ id: "sfg", name: "Impulsförderung", fundingBody: "SFG", createdBy: "aaron" }).run();
    db.insert(wikiPages).values([
      { id: "page", title: "Förderlandschaft", slug: "foerderlandschaft", createdBy: "aaron", updatedBy: "aaron" },
      { id: "gone", title: "Alt", slug: "alt", createdBy: "aaron", updatedBy: "aaron", deletedAt: new Date() },
    ]).run();
  }

  it("links a contact both ways and ignores duplicates", async () => {
    seedTargets();
    const maria = await capture("Maria");
    expect(await linkNetworkContact({ contactId: maria, targetType: "fundingProject", targetId: "sfg" })).toEqual({ ok: true });
    expect(await linkNetworkContact({ contactId: maria, targetType: "fundingProject", targetId: "sfg" })).toEqual({ ok: true });
    expect(await linkNetworkContact({ contactId: maria, targetType: "wikiPage", targetId: "page" })).toEqual({ ok: true });

    expect(getNetworkContact(aaron, maria)!.links).toMatchObject([
      { type: "fundingProject", title: "Impulsförderung", subtitle: "SFG", href: "/accounting/funding-projects/sfg" },
      { type: "wikiPage", title: "Förderlandschaft", href: "/wiki/pages/foerderlandschaft" },
    ]);
    const [linked] = listLinkedNetworkContacts(aaron, "fundingProject", "sfg");
    expect(linked).toMatchObject({ contactId: maria, name: "Maria" });
    expect(await unlinkNetworkContact(linked.linkId)).toEqual({ ok: true });
    expect(listLinkedNetworkContacts(aaron, "fundingProject", "sfg")).toEqual([]);
  });

  it("rejects missing or deleted targets", async () => {
    seedTargets();
    const maria = await capture("Maria");
    expect(await linkNetworkContact({ contactId: maria, targetType: "project", targetId: "missing" })).toEqual({ ok: false, error: "invalid" });
    expect(await linkNetworkContact({ contactId: maria, targetType: "wikiPage", targetId: "gone" })).toEqual({ ok: false, error: "invalid" });
  });

  it("keeps private contacts off shared pages for everyone else", async () => {
    seedTargets();
    const maria = await capture("Maria");
    await linkNetworkContact({ contactId: maria, targetType: "project", targetId: "pilot" });
    expect(listLinkedNetworkContacts(colleague, "project", "pilot")).toEqual([]);
    as(colleague);
    expect(await linkNetworkContact({ contactId: maria, targetType: "project", targetId: "pilot" })).toEqual({ ok: false, error: "notFound" });
    expect(await setNetworkContactVisibility({ contactId: maria, visibility: "team" })).toEqual({ ok: false, error: "notFound" });
    as(aaron);
    await setNetworkContactVisibility({ contactId: maria, visibility: "team" });
    expect(listLinkedNetworkContacts(colleague, "project", "pilot").map((contact) => contact.name)).toEqual(["Maria"]);
  });

  it("finds link targets across modules, skipping deleted pages", async () => {
    seedTargets();
    const results = await searchNetworkLinkTargets("f");
    expect(results.map((target) => `${target.type}:${target.id}`).sort()).toEqual(["fundingProject:sfg", "wikiPage:page"]);
  });
});
