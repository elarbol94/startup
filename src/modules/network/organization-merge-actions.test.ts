import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const auth = vi.hoisted(() => {
  const requireUserOrThrow = vi.fn();
  const requireAdmin = vi.fn(async () => {
    const user = await requireUserOrThrow();
    if (user.role !== "admin") throw new Error("Forbidden: admin only");
    return user;
  });
  return { requireUserOrThrow, requireAdmin };
});
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
import { networkContacts, networkLeads, networkOrganizations, user } from "@/db/schema";
import { localDateInZone } from "@/modules/calendar/date-utils";
import { TIME_ZONE } from "@/modules/time/lib/entry-time";
import { deleteNetworkContact } from "./contact-actions";
import { normalizeText } from "./network-utils";
import { updateNetworkOrganization } from "./organization-actions";
import { getNetworkOrganizationMergePreview, mergeNetworkOrganizations } from "./organization-merge-actions";
import { listOrganizationMergeCandidates } from "./organization-merge";

const aaron = { id: "aaron", role: "member" };
const colleague = { id: "colleague", role: "member" };
const admin = { id: "admin", role: "admin" };
const as = (viewer: { id: string; role: string }) => auth.requireUserOrThrow.mockResolvedValue(viewer);

type NewOrganization = typeof networkOrganizations.$inferInsert;
const organization = (id: string, name: string, values: Partial<NewOrganization> = {}) =>
  db.insert(networkOrganizations).values({ id, name, normalizedName: normalizeText(name), createdBy: "aaron", ...values }).returning().get();
const organizationRow = (id: string) => db.select().from(networkOrganizations).where(eq(networkOrganizations.id, id)).get();
const contactRow = (id: string) => db.select().from(networkContacts).where(eq(networkContacts.id, id)).get()!;
const leadRow = (id: string) => db.select().from(networkLeads).where(eq(networkLeads.id, id)).get()!;
/** The merge note's date as the English formatter writes it, e.g. "Sep 28, 2026". */
const today = () => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${localDateInZone(new Date(), TIME_ZONE)}T12:00:00Z`));

/** SFG (kept) with a team contact; "Steir. Wirtschaftsförderung" (merged) with a private contact of Aaron's and a lead of the colleague's. */
function seed() {
  organization("keep", "SFG", { createdBy: "admin" });
  organization("merge", "Steirische Wirtschaftsförderung");
  db.insert(networkContacts).values([
    { id: "team", ownerId: "admin", name: "Team Contact", visibility: "team", organization: "SFG", organizationId: "keep" },
    { id: "secret", ownerId: "aaron", name: "Secret Person", visibility: "private", organization: "Steirische Wirtschaftsförderung", organizationId: "merge" },
    { id: "introducer", ownerId: "colleague", name: "Introducer", visibility: "private" },
  ]).run();
  const lead = db.insert(networkLeads).values({
    contactId: "introducer", summary: "Kennt jemanden", targetOrganization: "Steirische Wirtschaftsförderung", targetOrganizationId: "merge", createdBy: "colleague",
  }).returning().get();
  return lead.id;
}

beforeEach(() => {
  db.delete(networkContacts).run();
  db.delete(networkOrganizations).run();
  db.delete(user).run();
  const now = new Date();
  db.insert(user).values([aaron, colleague, admin].map((viewer) => ({
    id: viewer.id, name: viewer.id, email: `${viewer.id}@example.com`, role: viewer.role, createdAt: now, updatedAt: now,
  }))).run();
  vi.mocked(revalidatePath).mockClear();
  as(admin);
});
afterAll(() => sqlite.close());

describe("organisation merge", () => {
  it("is admin only", async () => {
    seed();
    as(aaron);
    await expect(getNetworkOrganizationMergePreview({ keepId: "keep", mergeId: "merge" })).rejects.toThrow("admin only");
    await expect(mergeNetworkOrganizations({ keepId: "keep", mergeId: "merge" })).rejects.toThrow("admin only");
    expect(organizationRow("merge")).toBeDefined();
    expect(listOrganizationMergeCandidates(aaron, "merge")).toEqual([]);
  });

  it("names the clashing organisation on rename to admins only", async () => {
    seed();
    as(aaron);
    expect(await updateNetworkOrganization({ id: "merge", name: "sfg" })).toEqual({ ok: false, error: "duplicate" });
    as(admin);
    organization("mine", "Admin GmbH", { createdBy: "admin" });
    expect(await updateNetworkOrganization({ id: "mine", name: "sfg" })).toEqual({ ok: false, error: "duplicate", clash: { id: "keep", name: "SFG" } });
  });

  it("previews counts only, never the names of contacts the admin cannot see", async () => {
    seed();
    const result = await getNetworkOrganizationMergePreview({ keepId: "keep", mergeId: "merge" });
    expect(result).toEqual({
      ok: true,
      preview: {
        keep: { id: "keep", name: "SFG" },
        merge: { id: "merge", name: "Steirische Wirtschaftsförderung" },
        counts: { contacts: 1, leads: 1 },
        conflicts: [{ key: "name", keep: "SFG", merge: "Steirische Wirtschaftsförderung" }],
        filled: [],
        blockers: [],
      },
    });
    expect(JSON.stringify(result)).not.toContain("Secret Person");
    expect(JSON.stringify(result)).not.toContain("Introducer");
  });

  it("moves every reference, other users' private contacts included, and syncs display names", async () => {
    const leadId = seed();
    expect(await mergeNetworkOrganizations({ keepId: "keep", mergeId: "merge" })).toEqual({ ok: true, organizationId: "keep", visible: true });
    expect(organizationRow("merge")).toBeUndefined();
    expect(contactRow("secret")).toMatchObject({ organizationId: "keep", organization: "SFG", ownerId: "aaron", visibility: "private" });
    expect(contactRow("team")).toMatchObject({ organizationId: "keep", organization: "SFG" });
    expect(leadRow(leadId)).toMatchObject({ targetOrganizationId: "keep", targetOrganization: "SFG", createdBy: "colleague" });
    // Only a losing name and nothing else: no notes are added (they would keep the organisation forever).
    expect(organizationRow("keep")!.notes).toBe("");
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("applies the chosen name, website and municipality and keeps the rest in the notes", async () => {
    const leadId = seed();
    db.update(networkOrganizations).set({ website: "https://sfg.at", municipalityCode: "60101", municipalityName: "Graz", notes: "Förderstelle" }).where(eq(networkOrganizations.id, "keep")).run();
    db.update(networkOrganizations).set({ website: "https://old.example", municipalityCode: "61120", municipalityName: "Trofaiach", notes: "Alte Notiz" }).where(eq(networkOrganizations.id, "merge")).run();
    const preview = await getNetworkOrganizationMergePreview({ keepId: "keep", mergeId: "merge" });
    expect(preview.ok && preview.preview.conflicts.map((conflict) => conflict.key)).toEqual(["name", "website", "municipality"]);

    expect(await mergeNetworkOrganizations({ keepId: "keep", mergeId: "merge", choices: { name: "merge", municipality: "merge" } })).toMatchObject({ ok: true });
    expect(organizationRow("keep")).toMatchObject({
      name: "Steirische Wirtschaftsförderung",
      normalizedName: normalizeText("Steirische Wirtschaftsförderung"),
      website: "https://sfg.at",
      municipalityCode: "61120",
      municipalityName: "Trofaiach",
      notes: `Förderstelle\n\nMerged from Steirische Wirtschaftsförderung on ${today()}: Website: https://old.example, Municipality: Graz\nAlte Notiz`,
    });
    expect(contactRow("team").organization).toBe("Steirische Wirtschaftsförderung");
    expect(leadRow(leadId).targetOrganization).toBe("Steirische Wirtschaftsförderung");
  });

  it("fills empty fields from the merged organisation without a choice", async () => {
    seed();
    db.update(networkOrganizations).set({ website: "https://wifo.example", municipalityCode: "61120", municipalityName: "Trofaiach" }).where(eq(networkOrganizations.id, "merge")).run();
    const preview = await getNetworkOrganizationMergePreview({ keepId: "keep", mergeId: "merge" });
    expect(preview.ok && preview.preview.filled).toEqual(["website", "municipality"]);
    await mergeNetworkOrganizations({ keepId: "keep", mergeId: "merge" });
    expect(organizationRow("keep")).toMatchObject({ name: "SFG", website: "https://wifo.example", municipalityCode: "61120" });
  });

  it("refuses notes over the limit, in the preview and the merge", async () => {
    seed();
    db.update(networkOrganizations).set({ notes: "a".repeat(15_000) }).where(eq(networkOrganizations.id, "keep")).run();
    db.update(networkOrganizations).set({ notes: "b".repeat(6_000) }).where(eq(networkOrganizations.id, "merge")).run();
    const preview = await getNetworkOrganizationMergePreview({ keepId: "keep", mergeId: "merge" });
    expect(preview.ok && preview.preview.blockers).toEqual(["notesTooLong"]);
    expect(await mergeNetworkOrganizations({ keepId: "keep", mergeId: "merge" })).toEqual({ ok: false, error: "notesTooLong" });
    expect(organizationRow("merge")).toBeDefined();
    expect(contactRow("secret").organizationId).toBe("merge");
  });

  it("rejects the same organisation twice, unknown ids and unknown choices", async () => {
    seed();
    expect(await mergeNetworkOrganizations({ keepId: "keep", mergeId: "keep" })).toEqual({ ok: false, error: "invalid" });
    expect(await getNetworkOrganizationMergePreview({ keepId: "keep", mergeId: "keep" })).toEqual({ ok: false, error: "invalid" });
    expect(await mergeNetworkOrganizations({ keepId: "keep", mergeId: "missing" })).toEqual({ ok: false, error: "notFound" });
    expect(await mergeNetworkOrganizations({ keepId: "keep", mergeId: "merge", choices: { notes: "merge" } as never })).toEqual({ ok: false, error: "invalid" });
    expect(organizationRow("keep")!.name).toBe("SFG");
  });

  it("rolls back completely when a write fails", async () => {
    const leadId = seed();
    sqlite.exec("CREATE TEMP TRIGGER fail_org_merge BEFORE DELETE ON network_organizations WHEN old.id = 'merge' BEGIN SELECT RAISE(ABORT, 'forced'); END;");
    try {
      await expect(mergeNetworkOrganizations({ keepId: "keep", mergeId: "merge", choices: { name: "merge" } })).rejects.toThrow("forced");
    } finally {
      sqlite.exec("DROP TRIGGER fail_org_merge;");
    }
    expect(organizationRow("keep")).toMatchObject({ name: "SFG", notes: "" });
    expect(organizationRow("merge")).toMatchObject({ name: "Steirische Wirtschaftsförderung" });
    expect(contactRow("secret")).toMatchObject({ organizationId: "merge", organization: "Steirische Wirtschaftsförderung" });
    expect(leadRow(leadId).targetOrganizationId).toBe("merge");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("leaves the cleanup of unused organisations as it was", async () => {
    seed();
    await mergeNetworkOrganizations({ keepId: "keep", mergeId: "merge" });
    // Kept while anything refers to it, removed with the last reference.
    await deleteNetworkContact("team");
    expect(organizationRow("keep")).toBeDefined();
    as(aaron);
    await deleteNetworkContact("secret");
    as(colleague);
    await deleteNetworkContact("introducer");
    expect(organizationRow("keep")).toBeUndefined();
  });

  it("offers admins the organisations they can see", () => {
    seed();
    organization("other", "Land Steiermark", { createdBy: "admin" });
    expect(listOrganizationMergeCandidates(admin, "keep")).toEqual([{ id: "other", name: "Land Steiermark" }]);
  });
});
