import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/auth", () => ({ requireUserOrThrow: async () => ({ id: "member", role: "member" }) }));
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
import { appSettings, categories, customers, entries, fundingBudgetItems, fundingProjects, user } from "@/db/schema";
import { upsertInvoice, setInvoiceStatus, upsertCustomer } from "./invoice-actions";
import { getInvoiceWithItems } from "./invoice-queries";
import { upsertFundingBookingAllocation } from "@/modules/funding/actions";

const item = { description: "Beratung", quantityThousandths: 1000, unitPriceCents: 10_000, vatRate: 20 };

beforeAll(() => {
  const now = new Date();
  db.insert(user).values({ id: "member", name: "Member", email: "m@example.com", role: "member", createdAt: now, updatedAt: now }).run();
  db.insert(appSettings).values({ id: "default", companyName: "Firma GmbH", address: "Alt 1" }).onConflictDoUpdate({ target: appSettings.id, set: { companyName: "Firma GmbH", address: "Alt 1" } }).run();
  db.insert(customers).values({ id: "c", name: "Kunde AG", address: "Alte Straße 1" }).run();
});
afterAll(() => sqlite.close());

it("prints issued invoices exactly as issued, while drafts follow live data", async () => {
  const { id } = await upsertInvoice({ customerId: "c", issueDate: "2026-03-01", dueDate: null, notes: "", items: [item] });
  await setInvoiceStatus(id, "sent");
  await upsertCustomer({ id: "c", name: "Umbenannt AG", address: "Neue Straße 9", uid: "", email: "", notes: "" });
  db.update(appSettings).set({ companyName: "Neue Firma" }).where(eq(appSettings.id, "default")).run();
  const issued = getInvoiceWithItems(id)!;
  expect(issued.customer).toMatchObject({ name: "Kunde AG", address: "Alte Straße 1" });
  expect(issued.issuer.companyName).toBe("Firma GmbH");
  const draft = await upsertInvoice({ customerId: "c", issueDate: "2026-03-02", dueDate: null, notes: "", items: [item] });
  expect(getInvoiceWithItems(draft.id)!.customer?.name).toBe("Umbenannt AG");
});

it("keeps a draft's number in its issue year", async () => {
  const { id } = await upsertInvoice({ customerId: "c", issueDate: "2026-12-30", dueDate: null, notes: "", items: [item] });
  await expect(upsertInvoice({ id, customerId: "c", issueDate: "2027-01-05", dueDate: null, notes: "", items: [item] })).rejects.toThrow("year");
  await expect(upsertInvoice({ id, customerId: "c", issueDate: "2026-12-31", dueDate: null, notes: "", items: [item] })).resolves.toEqual({ id });
});

it("rejects invoice lines whose amount would lose integer precision", async () => {
  await expect(upsertInvoice({ customerId: "c", issueDate: "2026-03-01", dueDate: null, notes: "", items: [{ ...item, quantityThousandths: 1e9, unitPriceCents: 1e9 }] })).rejects.toThrow();
});

it("limits funding allocations to finalized bookings and their gross amount", async () => {
  db.insert(categories).values({ id: "office", name: "Office", kind: "expense", template: "standard_expense" }).run();
  const entry = { kind: "expense" as const, date: "2026-01-01", description: "x", categoryId: "office", grossAmountCents: 10_000, vatRate: 0, vatAmountCents: 0, netAmountCents: 10_000, createdBy: "member" };
  db.insert(entries).values([{ ...entry, id: "booked" }, { ...entry, id: "voided", status: "voided" }]).run();
  db.insert(fundingProjects).values({ id: "p", fundingBody: "FFG", name: "Projekt", createdBy: "member" }).run();
  db.insert(fundingBudgetItems).values({ id: "b", projectId: "p", costType: "external_services", description: "Kosten", unitPriceCents: 10_000, totalCents: 10_000, eligibleAmountCents: 10_000 }).run();
  const allocation = { projectId: "p", budgetItemId: "b", bookingDate: "2026-01-01", description: "", evidenceStatus: "missing" as const, evidenceNote: "" };
  await upsertFundingBookingAllocation({ ...allocation, accountingEntryId: "booked", actualAmountCents: 6_000 });
  await expect(upsertFundingBookingAllocation({ ...allocation, accountingEntryId: "booked", actualAmountCents: 4_001 })).rejects.toThrow("exceed");
  await upsertFundingBookingAllocation({ ...allocation, accountingEntryId: "booked", actualAmountCents: 4_000 });
  await expect(upsertFundingBookingAllocation({ ...allocation, accountingEntryId: "voided", actualAmountCents: 1 })).rejects.toThrow("finalized");
  await expect(upsertFundingBookingAllocation({ ...allocation, accountingEntryId: "missing", actualAmountCents: 1 })).rejects.toThrow("finalized");
});
