// Shared types of the accounting entry dialog: the category row, receipt attachment DTO,
// tax-line draft state and the personnel/payroll rows the ledger passes in.
// Used by entry-dialog.tsx and components/entry-dialog/.
import type { categories as categoriesTable } from "@/modules/accounting/schema";

export type Category = typeof categoriesTable.$inferSelect;
export type AttachmentDto = { id: string; fileName: string };
export type AmountMode = "gross" | "net";
export type TaxLineState = {
  key: string;
  description: string;
  amountText: string;
  mode: AmountMode;
  vatRate: number;
  inputVatDeductiblePercent: number;
};
export type PersonnelEmployee = { id: string; name: string; userId: string | null; personnelNumber: string; employmentType: string; locationId: string | null };
export type PersonnelLocation = { id: string; name: string; state: string; municipality: string };
export type PayrollMonthContext = { payrollMonth: string; internalPayrollCents: number; externalPayrollCents: number; externalMarginalPayrollCents: number; marginalPayrollCents: number };
