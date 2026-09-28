import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { networkContacts, networkContactTags, networkOrganizations, networkTags, user } from "@/db/schema";
import { defaultContactListFilter } from "./contact-filters";
import { listNetworkContacts } from "./queries";

const aaron = { id: "aaron", role: "member" };
const colleague = { id: "colleague", role: "member" };
const admin = { id: "admin", role: "admin" };

type ContactRow = typeof networkContacts.$inferInsert;
function contact(values: Partial<ContactRow> & { id: string; name: string; ownerId: string }) {
  db.insert(networkContacts).values({ visibility: "private", createdAt: new Date("2026-01-01"), ...values }).run();
}
const names = (result: ReturnType<typeof listNetworkContacts>) => result.contacts.map((item) => item.name);

beforeEach(() => {
  db.delete(networkContacts).run();
  db.delete(networkTags).run();
  db.delete(networkOrganizations).run();
  db.delete(user).run();
  const now = new Date();
  db.insert(user).values([aaron, colleague, admin].map((viewer) => ({
    id: viewer.id, name: viewer.id, email: `${viewer.id}@example.com`, role: viewer.role, createdAt: now, updatedAt: now,
  }))).run();
  db.insert(networkOrganizations).values([
    { id: "tu", name: "TU Graz", normalizedName: "tu graz", createdBy: "aaron" },
    { id: "kb", name: "Klimabündnis", normalizedName: "klimabundnis", createdBy: "colleague" },
  ]).run();

  contact({ id: "c1", name: "Anna", ownerId: "aaron", relationship: "friend", closeness: "close", organization: "TU Graz", organizationId: "tu", municipalityCode: "61120", municipalityName: "Trofaiach", lastContactOn: "2026-03-01", createdAt: new Date("2026-01-03") });
  contact({ id: "c2", name: "Bernd", ownerId: "aaron", visibility: "team", relationship: "professional", closeness: "known", organization: "TU Graz", organizationId: "tu", lastContactOn: "2026-05-01", createdAt: new Date("2026-01-01") });
  contact({ id: "c3", name: "Clara", ownerId: "colleague", visibility: "team", relationship: "professional", closeness: "close", municipalityCode: "60101", municipalityName: "Graz", createdAt: new Date("2026-01-05") });
  // Colleague's private contact: must never appear for anyone else, whatever the filter.
  contact({ id: "c4", name: "Dora", ownerId: "colleague", relationship: "professional", closeness: "close", organization: "Klimabündnis", organizationId: "kb", municipalityCode: "62345", municipalityName: "Leoben", createdAt: new Date("2026-01-09") });

  db.insert(networkTags).values([
    { id: "t-design", name: "Design", normalizedName: "design", createdBy: "aaron" },
    { id: "t-secret", name: "Secret", normalizedName: "secret", createdBy: "colleague" },
  ]).run();
  db.insert(networkContactTags).values([
    { contactId: "c1", tagId: "t-design" },
    { contactId: "c3", tagId: "t-design" },
    { contactId: "c4", tagId: "t-secret" },
  ]).run();
});
afterAll(() => sqlite.close());

describe("listNetworkContacts filters", () => {
  it("lists visible contacts by name by default", () => {
    const result = listNetworkContacts(aaron);
    expect(names(result)).toEqual(["Anna", "Bernd", "Clara"]);
    expect(result.filter).toEqual(defaultContactListFilter);
    expect(result.total).toBe(3);
  });

  it("narrows by scope without ever widening", () => {
    expect(names(listNetworkContacts(aaron, { scope: "mine" }))).toEqual(["Anna", "Bernd"]);
    expect(names(listNetworkContacts(aaron, { scope: "team" }))).toEqual(["Bernd", "Clara"]);
    for (const viewer of [aaron, admin]) {
      for (const scope of ["all", "mine", "team"] as const) {
        expect(names(listNetworkContacts(viewer, { scope }))).not.toContain("Dora");
      }
    }
    expect(names(listNetworkContacts(colleague, { scope: "mine" }))).toEqual(["Clara", "Dora"]);
  });

  it("filters by relationship, closeness, organisation and municipality, combined", () => {
    expect(names(listNetworkContacts(aaron, { relationship: "professional" }))).toEqual(["Bernd", "Clara"]);
    expect(names(listNetworkContacts(aaron, { relationship: "professional", closeness: "close" }))).toEqual(["Clara"]);
    expect(names(listNetworkContacts(aaron, { organizationId: "tu" }))).toEqual(["Anna", "Bernd"]);
    expect(names(listNetworkContacts(aaron, { organizationId: "tu", scope: "team" }))).toEqual(["Bernd"]);
    expect(names(listNetworkContacts(aaron, { municipalityCode: "60101" }))).toEqual(["Clara"]);
    expect(names(listNetworkContacts(aaron, { tagId: "t-design", closeness: "close", query: "trofaiach" }))).toEqual(["Anna"]);
    expect(names(listNetworkContacts(aaron, { relationship: "event" }))).toEqual([]);
  });

  it("offers only facets of visible contacts and ignores unknown or hidden ones", () => {
    const result = listNetworkContacts(aaron);
    expect(result.organizations).toEqual([{ id: "tu", name: "TU Graz", count: 2 }]);
    expect(result.municipalities).toEqual([
      { id: "60101", name: "Graz", count: 1 },
      { id: "61120", name: "Trofaiach", count: 1 },
    ]);
    expect(result.tags).toEqual([{ id: "t-design", name: "Design", count: 2 }]);

    // A hidden contact's organisation, municipality or tag does not narrow the list to nothing (and so reveals nothing).
    const hidden = listNetworkContacts(aaron, { organizationId: "kb", municipalityCode: "62345", tagId: "t-secret" });
    expect(names(hidden)).toEqual(["Anna", "Bernd", "Clara"]);
    expect(hidden.filter).toMatchObject({ organizationId: "", municipalityCode: "", tagId: "" });
    expect(names(listNetworkContacts(aaron, { organizationId: "nope" }))).toEqual(["Anna", "Bernd", "Clara"]);
  });

  it("sorts by last contact and by creation date", () => {
    expect(names(listNetworkContacts(aaron, { sort: "lastContact" }))).toEqual(["Bernd", "Anna", "Clara"]);
    expect(names(listNetworkContacts(aaron, { sort: "recent" }))).toEqual(["Clara", "Anna", "Bernd"]);
    expect(names(listNetworkContacts(colleague, { sort: "recent", relationship: "professional" }))).toEqual(["Dora", "Clara", "Bernd"]);
  });
});
