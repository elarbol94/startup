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
import { networkContacts, networkOrganizations, networkTags, user } from "@/db/schema";
import { quickCaptureContact, setNetworkContactVisibility, updateNetworkContact } from "./contact-actions";
import { getMunicipalityNetwork, getNetworkMapCounts, searchNetworkMunicipalities } from "./municipality-actions";
import { updateNetworkOrganization } from "./organization-actions";

const aaron = { id: "aaron", role: "member" };
const colleague = { id: "colleague", role: "member" };
const as = (viewer: { id: string; role: string }) => auth.requireUserOrThrow.mockResolvedValue(viewer);
const LEOBEN = "61108";
const TROFAIACH = "61120";

async function capture(input: Parameters<typeof quickCaptureContact>[0]) {
  const result = await quickCaptureContact(input);
  if (!result.ok) throw new Error(result.error);
  return result.contactId;
}
const contactRow = (id: string) => db.select().from(networkContacts).where(eq(networkContacts.id, id)).get()!;

beforeEach(() => {
  db.delete(networkContacts).run();
  db.delete(networkOrganizations).run();
  db.delete(networkTags).run();
  db.delete(user).run();
  const now = new Date();
  db.insert(user).values([aaron, colleague].map((viewer) => ({
    id: viewer.id, name: viewer.id, email: `${viewer.id}@example.com`, role: viewer.role, createdAt: now, updatedAt: now,
  }))).run();
  as(aaron);
});
afterAll(() => sqlite.close());

describe("where contacts live", () => {
  it("stores the municipality code with its official name and rejects unknown codes", async () => {
    const id = await capture({ name: "Sebastian", municipalityCode: LEOBEN });
    expect(contactRow(id)).toMatchObject({ municipalityCode: LEOBEN, municipalityName: "Leoben" });
    expect(await quickCaptureContact({ name: "Nobody", municipalityCode: "99999" })).toEqual({ ok: false, error: "invalid" });
    expect(await quickCaptureContact({ name: "Nobody", municipalityCode: "Leoben" })).toEqual({ ok: false, error: "invalid" });

    // Adding a note to an existing contact never moves them.
    await capture({ contactId: id, note: "Neue Info", municipalityCode: TROFAIACH });
    expect(contactRow(id).municipalityCode).toBe(LEOBEN);

    expect(await updateNetworkContact({ id, name: "Sebastian", municipalityCode: TROFAIACH })).toEqual({ ok: true });
    expect(contactRow(id)).toMatchObject({ municipalityCode: TROFAIACH, municipalityName: "Trofaiach" });
    expect(await updateNetworkContact({ id, name: "Sebastian", municipalityCode: null })).toEqual({ ok: true });
    expect(contactRow(id)).toMatchObject({ municipalityCode: null, municipalityName: null });
  });

  it("searches municipalities like the map does", async () => {
    const [first] = await searchNetworkMunicipalities("leob");
    expect(first).toEqual({ code: LEOBEN, name: "Leoben", state: "Steiermark" });
    expect(await searchNetworkMunicipalities("")).toEqual([]);
  });
});

describe("municipality section", () => {
  it("lists residents and organisations there, limited to what the viewer may see", async () => {
    const shared = await capture({ name: "Anna", municipalityCode: TROFAIACH });
    await setNetworkContactVisibility({ contactId: shared, visibility: "team" });
    await capture({ name: "Sebastian", municipalityCode: TROFAIACH });

    const mayor = await capture({ name: "Mario", municipalityCode: LEOBEN });
    await updateNetworkContact({ id: mayor, name: "Mario", role: "Bürgermeister", organization: "Stadtgemeinde Trofaiach", municipalityCode: LEOBEN });
    const organizationId = contactRow(mayor).organizationId!;
    expect(await updateNetworkOrganization({ id: organizationId, name: "Stadtgemeinde Trofaiach", municipalityCode: TROFAIACH })).toEqual({ ok: true });

    const mine = await getMunicipalityNetwork(TROFAIACH);
    expect(mine.residents.map((person) => person.name)).toEqual(["Anna", "Sebastian"]);
    expect(mine.organizations).toMatchObject([{ name: "Stadtgemeinde Trofaiach", people: [{ name: "Mario", role: "Bürgermeister" }] }]);
    expect((await getMunicipalityNetwork(LEOBEN)).residents.map((person) => person.name)).toEqual(["Mario"]);

    // The colleague sees only the shared resident; the organisation is known only through a private contact.
    as(colleague);
    const theirs = await getMunicipalityNetwork(TROFAIACH);
    expect(theirs.residents.map((person) => person.name)).toEqual(["Anna"]);
    expect(theirs.organizations).toEqual([]);
    expect(await getMunicipalityNetwork("../etc")).toEqual({ residents: [], organizations: [] });
  });

  it("counts visible people per municipality for the map, each person once", async () => {
    const anna = await capture({ name: "Anna", municipalityCode: TROFAIACH });
    await setNetworkContactVisibility({ contactId: anna, visibility: "team" });
    await capture({ name: "Sebastian", municipalityCode: TROFAIACH });
    const mario = await capture({ name: "Mario", municipalityCode: TROFAIACH });
    await updateNetworkContact({ id: mario, name: "Mario", organization: "Stadtgemeinde Trofaiach", municipalityCode: TROFAIACH });
    await updateNetworkOrganization({ id: contactRow(mario).organizationId!, name: "Stadtgemeinde Trofaiach", municipalityCode: TROFAIACH });
    const jonas = await capture({ name: "Jonas", municipalityCode: LEOBEN });
    await updateNetworkContact({ id: jonas, name: "Jonas", organization: "Stadtgemeinde Trofaiach", municipalityCode: LEOBEN });

    const byCode = (counts: Awaited<ReturnType<typeof getNetworkMapCounts>>) => Object.fromEntries(counts.map((count) => [count.code, count]));
    expect(byCode(await getNetworkMapCounts())).toEqual({
      [TROFAIACH]: { code: TROFAIACH, residents: 3, atOrganizations: 2, total: 4 },
      [LEOBEN]: { code: LEOBEN, residents: 1, atOrganizations: 0, total: 1 },
    });
    as(colleague);
    expect(await getNetworkMapCounts()).toEqual([{ code: TROFAIACH, residents: 1, atOrganizations: 0, total: 1 }]);
  });

  it("rejects an unknown municipality on an organisation", async () => {
    const id = await capture({ name: "Mario" });
    await updateNetworkContact({ id, name: "Mario", organization: "Stadtgemeinde Leoben" });
    const organizationId = contactRow(id).organizationId!;
    expect(await updateNetworkOrganization({ id: organizationId, name: "Stadtgemeinde Leoben", municipalityCode: "00000" })).toEqual({ ok: false, error: "invalid" });
  });
});
