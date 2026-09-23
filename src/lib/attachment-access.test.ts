import { afterAll, beforeAll, expect, it, vi } from "vitest";
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
import { categories, customers, entries, invoices, user } from "@/db/schema";
import { attachmentAccessError } from "./attachment-access";

const member = { id: "member", role: "member" };
const personnel = { id: "hr", role: "personnel" };

beforeAll(() => {
  const now = new Date();
  db.insert(user).values([
    { id: "member", name: "Member", email: "m@example.com", role: "member", createdAt: now, updatedAt: now },
    { id: "hr", name: "HR", email: "hr@example.com", role: "personnel", createdAt: now, updatedAt: now },
  ]).run();
  db.insert(categories).values([
    { id: "office", name: "Office", kind: "expense", template: "standard_expense" },
    { id: "payroll", name: "Payroll", kind: "expense", template: "personnel" },
  ]).run();
  const entry = { kind: "expense" as const, date: "2026-01-01", description: "x", grossAmountCents: 100, vatRate: 0, vatAmountCents: 0, netAmountCents: 100, createdBy: "member" };
  db.insert(entries).values([
    { ...entry, id: "draft", categoryId: "office", status: "draft" },
    { ...entry, id: "booked", categoryId: "office", status: "finalized" },
    { ...entry, id: "voided", categoryId: "office", status: "voided" },
    { ...entry, id: "salary", categoryId: "payroll", status: "finalized" },
  ]).run();
  db.insert(customers).values({ id: "c", name: "Customer" }).run();
  const invoice = { customerId: "c", issueDate: "2026-01-01", createdBy: "member", numberYear: 2026 };
  db.insert(invoices).values([
    { ...invoice, id: "inv-draft", invoiceNumber: "RE-1", numberSeq: 1, status: "draft" },
    { ...invoice, id: "inv-sent", invoiceNumber: "RE-2", numberSeq: 2, status: "sent" },
  ]).run();
});
afterAll(() => sqlite.close());

it("keeps receipts of booked entries and issued invoices", () => {
  expect(attachmentAccessError(member, "entry", "draft", "delete")).toBeNull();
  expect(attachmentAccessError(member, "entry", "booked", "delete")).toBe(403);
  expect(attachmentAccessError(member, "entry", "booked", "upload")).toBeNull();
  expect(attachmentAccessError(member, "entry", "voided", "upload")).toBe(403);
  expect(attachmentAccessError(member, "invoice", "inv-draft", "delete")).toBeNull();
  expect(attachmentAccessError(member, "invoice", "inv-sent", "delete")).toBe(403);
});

it("hides payroll receipts from roles without personnel access", () => {
  expect(attachmentAccessError(member, "entry", "salary", "read")).toBe(404);
  expect(attachmentAccessError(personnel, "entry", "salary", "read")).toBeNull();
  expect(attachmentAccessError(member, "entry", "missing", "read")).toBe(404);
});
