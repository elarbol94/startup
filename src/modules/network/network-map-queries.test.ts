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
import { networkContacts, networkContactTags, networkLeads, networkOrganizations, networkTags, user } from "@/db/schema";
import { getNetworkMap } from "./network-map-queries";

const aaron = { id: "aaron", role: "member" };
const colleague = { id: "colleague", role: "member" };
const admin = { id: "admin", role: "admin" };

type ContactRow = typeof networkContacts.$inferInsert;
function contact(values: Partial<ContactRow> & { id: string; name: string; ownerId: string }) {
  db.insert(networkContacts).values({ visibility: "private", createdAt: new Date("2026-01-01"), ...values }).run();
}

beforeEach(() => {
  db.delete(networkLeads).run();
  db.delete(networkContacts).run();
  db.delete(networkTags).run();
  db.delete(networkOrganizations).run();
  db.delete(user).run();
  const now = new Date();
  db.insert(user).values([aaron, colleague, admin].map((viewer) => ({
    id: viewer.id, name: viewer.id, email: `${viewer.id}@example.com`, role: viewer.role, createdAt: now, updatedAt: now,
  }))).run();
  db.insert(networkOrganizations).values([
    { id: "tu", name: "TU Graz", normalizedName: "tu graz", createdBy: "aaron", municipalityCode: "60101", municipalityName: "Graz" },
    // Visible to aaron only because he created it; nobody works there.
    { id: "gem", name: "Gemeinde Leoben", normalizedName: "gemeinde leoben", createdBy: "aaron", municipalityCode: "61108", municipalityName: "Leoben" },
    // Only reachable through the colleague's private contact.
    { id: "kb", name: "Klimabündnis", normalizedName: "klimabundnis", createdBy: "colleague", municipalityCode: "50101", municipalityName: "Salzburg" },
  ]).run();

  contact({ id: "c1", name: "Anna", ownerId: "aaron", closeness: "close", organization: "TU Graz", organizationId: "tu", municipalityCode: "61120", municipalityName: "Trofaiach" });
  contact({ id: "c2", name: "Bernd", ownerId: "aaron", visibility: "team", closeness: "known", municipalityCode: "60101", municipalityName: "Graz" });
  contact({ id: "c3", name: "Clara", ownerId: "colleague", visibility: "team" });
  // Colleague's private contact: never on anyone else's map, not even as a line.
  contact({ id: "c4", name: "Dora", ownerId: "colleague", organization: "Klimabündnis", organizationId: "kb", municipalityCode: "62345", municipalityName: "Leoben-Land" });

  db.insert(networkTags).values({ id: "t-design", name: "Design", normalizedName: "design", createdBy: "aaron" }).run();
  db.insert(networkContactTags).values({ contactId: "c2", tagId: "t-design" }).run();

  db.insert(networkLeads).values([
    { id: "l1", contactId: "c2", summary: "Intro to the Gemeinde", targetOrganizationId: "gem", createdBy: "aaron" },
    { id: "l2", contactId: "c2", summary: "Intro to Dora", targetContactId: "c4", createdBy: "aaron" },
    { id: "l3", contactId: "c1", summary: "Done already", targetOrganizationId: "gem", status: "done", createdBy: "aaron" },
  ]).run();
});
afterAll(() => sqlite.close());

describe("getNetworkMap", () => {
  it("returns visible people with their locations and located organisations", () => {
    const map = getNetworkMap(aaron, {});
    expect(map.people.map((person) => person.id)).toEqual(["c1", "c2", "c3"]);
    expect(map.people.find((person) => person.id === "c1")).toMatchObject({ organizationId: "tu", municipalityCode: "61120", closeness: "close" });
    expect(map.organizations.map((organization) => organization.id).sort()).toEqual(["gem", "tu"]);
  });

  it("never reveals a colleague's private contact, its organisation or a lead pointing at it", () => {
    for (const viewer of [aaron, admin]) {
      const map = getNetworkMap(viewer, {});
      expect(map.people.map((person) => person.id)).not.toContain("c4");
      expect(map.organizations.map((organization) => organization.id)).not.toContain("kb");
      expect(map.introductions.flatMap((introduction) => introduction.targetCodes)).not.toContain("62345");
    }
    expect(getNetworkMap(colleague, {}).people.map((person) => person.id)).toContain("c4");
  });

  it("turns active leads into target locations", () => {
    expect(getNetworkMap(aaron, {}).introductions).toEqual([{ contactId: "c2", targetCodes: ["61108"] }]);
  });

  it("filters like the list and then drops organisations without a matching person", () => {
    const map = getNetworkMap(aaron, { tagId: "t-design" });
    expect(map.people.map((person) => person.id)).toEqual(["c2"]);
    expect(map.organizations).toEqual([]);
    expect(map.filter.tagId).toBe("t-design");
    expect(map.total).toBe(3);
  });

  it("ignores a residence filter: on the map that is the selection", () => {
    expect(getNetworkMap(aaron, { municipalityCode: "61120" }).people).toHaveLength(3);
  });
});
