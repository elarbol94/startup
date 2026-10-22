// Automatic Austrian 2026 payroll calculation for a personnel entry, netting out what this
// entry already contributed to the month's payroll totals. Used by entry-dialog.tsx.
import { useMemo } from "react";
import type { EntryRow } from "@/modules/accounting/queries";
import type { CategoryTemplate } from "@/modules/accounting/schema";
import { calculatePayrollAt2026, payrollEmploymentTypes } from "../../lib/payroll-at-2026";
import { storedAmountCents } from "../../lib/payroll-special-fields";
import type { PayrollMonthContext, PersonnelLocation } from "./entry-dialog-types";

export type PayrollCalculation = ReturnType<typeof calculatePayrollAt2026>;

export function usePayrollCalculation({
  template,
  special,
  entry,
  payrollMonthContexts,
  personnelLocations,
}: {
  template: CategoryTemplate;
  special: Record<string, string | boolean>;
  entry: EntryRow | null;
  payrollMonthContexts: PayrollMonthContext[];
  personnelLocations: PersonnelLocation[];
}) {
  return useMemo(() => {
    if (template !== "personnel" || special.calculationMode === "manual") return null;
    const payrollMonth = String(special.payrollMonth ?? "");
    const location = personnelLocations.find((item) => item.id === special.locationId);
    const employmentTypeValue = special.employmentType === "managing_director"
      ? "managing_director_asvg"
      : String(special.employmentType ?? "employee");
    if (!location || !payrollEmploymentTypes.includes(employmentTypeValue as (typeof payrollEmploymentTypes)[number])) return null;
    const context = payrollMonthContexts.find((item) => item.payrollMonth === payrollMonth);
    const grossCents = storedAmountCents(special.grossSalary);
    const previousEntryGross = entry?.specialFields.calculationMode === "auto" && entry.specialFields.payrollMonth === payrollMonth
      ? storedAmountCents(entry.specialFields.grossSalary)
      : 0;
    const previousEntryMarginal = previousEntryGross > 0 && entry?.specialFields.employmentType === "marginal" ? previousEntryGross : 0;
    const externalPayrollCents = special.externalPayroll === undefined || special.externalPayroll === ""
      ? (context?.externalPayrollCents ?? 0)
      : storedAmountCents(special.externalPayroll);
    const externalMarginalCents = special.externalMarginalPayroll === undefined || special.externalMarginalPayroll === ""
      ? (context?.externalMarginalPayrollCents ?? 0)
      : storedAmountCents(special.externalMarginalPayroll);
    const internalPayrollCents = Math.max(0, (context?.internalPayrollCents ?? 0) - previousEntryGross + grossCents);
    const storedInternalMarginalCents = Math.max(0, (context?.marginalPayrollCents ?? 0) - (context?.externalMarginalPayrollCents ?? 0));
    const marginalPayrollCents = Math.max(0, storedInternalMarginalCents - previousEntryMarginal
      + (employmentTypeValue === "marginal" ? grossCents : 0) + externalMarginalCents);
    return calculatePayrollAt2026({
      grossCents,
      employmentType: employmentTypeValue as (typeof payrollEmploymentTypes)[number],
      payrollMonth,
      location,
      monthlyPayrollTotalCents: internalPayrollCents + externalPayrollCents,
      monthlyMarginalPayrollTotalCents: marginalPayrollCents,
      otherPersonnelCostCents: storedAmountCents(special.otherPersonnelCost),
    });
  }, [entry, payrollMonthContexts, personnelLocations, special, template]);
}
