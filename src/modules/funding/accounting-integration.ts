import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { fundingBookingAllocations, fundingIncomeLinks, fundingProjects } from "@/db/schema";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Voided bookings must stop counting towards funding projects. */
export function deleteFundingAllocations(tx: DbTransaction, accountingEntryId: string) {
  tx.delete(fundingBookingAllocations)
    .where(eq(fundingBookingAllocations.accountingEntryId, accountingEntryId))
    .run();
}

/** Contract §5.5: allocations of an entry never exceed abs(entry.grossAmountCents). */
export function assertFundingAllocationsFit(tx: DbTransaction, accountingEntryId: string, grossAmountCents: number) {
  const allocated = tx
    .select({ value: sql<number>`coalesce(sum(${fundingBookingAllocations.actualAmountCents}), 0)` })
    .from(fundingBookingAllocations)
    .where(eq(fundingBookingAllocations.accountingEntryId, accountingEntryId))
    .get()?.value ?? 0;
  if (allocated > Math.abs(grossAmountCents)) {
    throw new Error("Funding allocations exceed the booking amount");
  }
}

/** Funding-owned adapter used inside the accounting mutation transaction. */
export function syncFundingIncomeLink(
  tx: DbTransaction,
  accountingEntryId: string,
  projectId: string | null,
) {
  tx.delete(fundingIncomeLinks)
    .where(eq(fundingIncomeLinks.accountingEntryId, accountingEntryId))
    .run();
  if (!projectId) return;
  const project = tx
    .select({ id: fundingProjects.id })
    .from(fundingProjects)
    .where(eq(fundingProjects.id, projectId))
    .get();
  if (!project) throw new Error("Funding project not found");
  tx.insert(fundingIncomeLinks).values({ projectId, accountingEntryId }).run();
}
