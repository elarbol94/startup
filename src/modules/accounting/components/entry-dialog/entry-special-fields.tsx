// Category-specific section of the entry form: funding project, hospitality, travel,
// vehicle, asset, personnel payroll (auto calculation or manual override) and SVS/tax levy.
// Used by entry-dialog.tsx; renders nothing for standard income/expense categories.
"use client";

import type { Dispatch, SetStateAction } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Calculator, LockKeyhole } from "lucide-react";
import { UserIdentity } from "@/components/user-identity";
import { formatCents } from "@/lib/money";
import type { CategoryTemplate } from "@/modules/accounting/schema";
import { payrollEmploymentTypes } from "../../lib/payroll-at-2026";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { PersonnelEmployee, PersonnelLocation } from "./entry-dialog-types";
import { FieldLabel, FormSection, TaxHelp } from "./entry-form-parts";
import type { PayrollCalculation } from "./use-payroll-calculation";

export function EntrySpecialFields({
  template,
  special,
  setSpecial,
  date,
  documentDate,
  fundingProjects,
  personnelEmployees,
  personnelLocations,
  payrollCalculation,
  personnelCostCents,
  paymentTotal,
}: {
  template: CategoryTemplate;
  special: Record<string, string | boolean>;
  setSpecial: Dispatch<SetStateAction<Record<string, string | boolean>>>;
  date: string;
  documentDate: string;
  fundingProjects: Array<{ id: string; name: string }>;
  personnelEmployees: PersonnelEmployee[];
  personnelLocations: PersonnelLocation[];
  payrollCalculation: PayrollCalculation | null;
  personnelCostCents: number | null;
  paymentTotal: number;
}) {
  const tf = useTranslations("accountingEntry");
  const locale = useLocale();

  function setSpecialValue(key: string, value: string | boolean) {
    setSpecial((current) => ({ ...current, [key]: value }));
  }

  if (template === "grant_income") return (
    <FormSection title={tf("categoryDetails")} description={tf(`templates.${template}.description`)}>
      <div className="sm:col-span-2"><FieldLabel htmlFor="funding-project">{tf("fundingProject")}</FieldLabel><Select value={String(special.fundingProjectId ?? "none")} onValueChange={(value) => setSpecialValue("fundingProjectId", value === "none" ? "" : (value ?? ""))}><SelectTrigger id="funding-project"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{tf("noFundingProject")}</SelectItem>{fundingProjects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}</SelectContent></Select><p className="mt-1.5 text-xs text-muted-foreground">{tf("fundingProjectHint")}</p></div>
    </FormSection>
  );
  if (template === "hospitality") return (
    <FormSection title={tf("categoryDetails")} description={tf(`templates.${template}.description`)}>
      <div className="sm:col-span-2"><FieldLabel htmlFor="business-purpose" help={tf("help.businessPurpose")}>{tf("businessPurpose")}</FieldLabel><Input id="business-purpose" value={String(special.businessPurpose ?? "")} onChange={(e) => setSpecialValue("businessPurpose", e.target.value)} /></div>
      <div><FieldLabel htmlFor="participants" help={tf("help.participants")}>{tf("participants")}</FieldLabel><Input id="participants" value={String(special.participants ?? "")} onChange={(e) => setSpecialValue("participants", e.target.value)} /></div>
      <label className="flex items-center gap-3 self-end rounded-lg border bg-card p-3"><Checkbox checked={special.advertisingPurpose === true} onCheckedChange={(checked) => setSpecialValue("advertisingPurpose", checked === true)} /><span>{tf("advertisingPurpose")}</span><TaxHelp text={tf("help.advertisingPurpose")} /></label>
    </FormSection>
  );
  if (template === "travel") {
    const km = Number(String(special.kilometres ?? "").replace(",", ".")) || 0;
    return (
      <FormSection title={tf("categoryDetails")} description={tf(`templates.${template}.description`)}>
        <div><FieldLabel htmlFor="traveler">{tf("traveler")}</FieldLabel><Input id="traveler" value={String(special.traveler ?? "")} onChange={(e) => setSpecialValue("traveler", e.target.value)} /></div>
        <div><FieldLabel htmlFor="destination">{tf("destination")}</FieldLabel><Input id="destination" value={String(special.destination ?? "")} onChange={(e) => setSpecialValue("destination", e.target.value)} /></div>
        <div className="sm:col-span-2"><FieldLabel htmlFor="travel-purpose">{tf("travelPurpose")}</FieldLabel><Input id="travel-purpose" value={String(special.travelPurpose ?? "")} onChange={(e) => setSpecialValue("travelPurpose", e.target.value)} /></div>
        <div><FieldLabel htmlFor="trip-start">{tf("tripStart")}</FieldLabel><Input id="trip-start" type="datetime-local" value={String(special.tripStart ?? "")} onChange={(e) => setSpecialValue("tripStart", e.target.value)} /></div>
        <div><FieldLabel htmlFor="trip-end">{tf("tripEnd")}</FieldLabel><Input id="trip-end" type="datetime-local" value={String(special.tripEnd ?? "")} onChange={(e) => setSpecialValue("tripEnd", e.target.value)} /></div>
        <div><FieldLabel htmlFor="kilometres" help={tf("help.kilometreAllowance")}>{tf("kilometres")}</FieldLabel><Input id="kilometres" inputMode="decimal" value={String(special.kilometres ?? "")} onChange={(e) => setSpecialValue("kilometres", e.target.value)} /></div>
        <div className="rounded-lg border bg-surface-raised p-3 text-sm"><span className="text-muted-foreground">{tf("kilometreSuggestion")}</span><strong className="mt-1 block font-semibold tabular-nums">{formatCents(Math.round(km * 50), locale)}</strong><span className="text-xs text-text-tertiary">{tf("ruleReviewRequired")}</span></div>
      </FormSection>
    );
  }
  if (template === "vehicle") return (
    <FormSection title={tf("categoryDetails")} description={tf(`templates.${template}.description`)}>
      <div><FieldLabel htmlFor="vehicle-name">{tf("vehicleName")}</FieldLabel><Input id="vehicle-name" value={String(special.vehicleName ?? "")} onChange={(e) => setSpecialValue("vehicleName", e.target.value)} /></div>
      <div><FieldLabel htmlFor="vehicle-type" help={tf("help.vehicleType")}>{tf("vehicleType")}</FieldLabel><Select value={String(special.vehicleType ?? "")} onValueChange={(value) => setSpecialValue("vehicleType", value ?? "")}><SelectTrigger id="vehicle-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pkw">{tf("vehicleTypes.pkw")}</SelectItem><SelectItem value="fiscalTruck">{tf("vehicleTypes.fiscalTruck")}</SelectItem><SelectItem value="electric">{tf("vehicleTypes.electric")}</SelectItem><SelectItem value="other">{tf("vehicleTypes.other")}</SelectItem></SelectContent></Select></div>
      <div><FieldLabel htmlFor="business-use">{tf("businessUsePercent")}</FieldLabel><Input id="business-use" type="number" min={0} max={100} value={String(special.businessUsePercent ?? "100")} onChange={(e) => setSpecialValue("businessUsePercent", e.target.value)} /></div>
      <label className="flex items-center gap-3 self-end rounded-lg border bg-card p-3"><Checkbox checked={special.inputVatEligible === true} onCheckedChange={(checked) => setSpecialValue("inputVatEligible", checked === true)} /><span>{tf("inputVatEligible")}</span><TaxHelp text={tf("help.inputVatVehicle")} /></label>
    </FormSection>
  );
  if (template === "asset") return (
    <FormSection title={tf("categoryDetails")} description={tf(`templates.${template}.description`)}>
      <div className="sm:col-span-2"><FieldLabel htmlFor="asset-name">{tf("assetName")}</FieldLabel><Input id="asset-name" value={String(special.assetName ?? "")} onChange={(e) => setSpecialValue("assetName", e.target.value)} /></div>
      <div><FieldLabel htmlFor="placed-in-service">{tf("placedInService")}</FieldLabel><Input id="placed-in-service" type="date" value={String(special.placedInServiceOn ?? documentDate)} onChange={(e) => setSpecialValue("placedInServiceOn", e.target.value)} /></div>
      <div><FieldLabel htmlFor="useful-life" help={tf("help.usefulLife")}>{tf("usefulLifeYears")}</FieldLabel><Input id="useful-life" type="number" min={1} max={100} value={String(special.usefulLifeYears ?? "")} onChange={(e) => setSpecialValue("usefulLifeYears", e.target.value)} /></div>
      <div className="rounded-lg border border-dashed border-line-strong p-3 text-text-secondary text-xs leading-5 sm:col-span-2">{tf("assetReviewNotice")}</div>
    </FormSection>
  );
  if (template === "personnel") {
    const mode = special.calculationMode === "manual" ? "manual" : "auto";
    const calculatedFields = ["employeeSv", "wageTax", "employerSv", "db", "dz", "municipalTax", "bvContribution", "viennaLevy"] as const;
    const manualFields = ["netSalary", ...calculatedFields] as const;
    const location = personnelLocations.find((item) => item.id === special.locationId);
    return (
      <FormSection title={tf("categoryDetails")} description={tf(`templates.${template}.description`)}>
        <div className="sm:col-span-2 flex gap-0.5 rounded-[10px] border bg-muted p-[3px]" aria-label={tf("personnel.calculationMode")}>
          {(["auto", "manual"] as const).map((item) => <button key={item} type="button" onClick={() => setSpecial((current) => ({ ...current, calculationMode: item, overrideReason: item === "auto" ? "" : current.overrideReason }))} className={`flex flex-1 items-center justify-center gap-2 rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${mode === item ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{item === "auto" ? <Calculator className="size-4" /> : <LockKeyhole className="size-4" />}{tf(`personnel.modes.${item}`)}</button>)}
        </div>
        <div className="sm:col-span-2"><FieldLabel htmlFor="personnel-employee">{tf("personnel.employeeMaster")}</FieldLabel><Select value={special.employeeId ? String(special.employeeId) : "new"} onValueChange={(value) => { const employee = personnelEmployees.find((item) => item.id === value); setSpecial((current) => employee ? { ...current, employeeId: employee.id, employeeName: employee.name, personnelNumber: employee.personnelNumber, employmentType: employee.employmentType === "managing_director" ? "managing_director_asvg" : employee.employmentType, locationId: employee.locationId ?? current.locationId } : { ...current, employeeId: "", employeeName: "", personnelNumber: "", employmentType: "employee" }); }}><SelectTrigger id="personnel-employee"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">{tf("personnel.newEmployee")}</SelectItem>{personnelEmployees.map((employee) => <SelectItem key={employee.id} value={employee.id}><UserIdentity userId={employee.userId} name={employee.name} />{employee.personnelNumber ? ` · ${employee.personnelNumber}` : ""}</SelectItem>)}</SelectContent></Select></div>
        <div><FieldLabel htmlFor="employee-name">{tf("personnel.employeeName")}</FieldLabel><Input id="employee-name" value={String(special.employeeName ?? "")} disabled={Boolean(special.employeeId)} onChange={(e) => setSpecialValue("employeeName", e.target.value)} /></div>
        <div><FieldLabel htmlFor="personnel-number">{tf("personnel.personnelNumber")}</FieldLabel><Input id="personnel-number" value={String(special.personnelNumber ?? "")} onChange={(e) => setSpecialValue("personnelNumber", e.target.value)} /></div>
        <div><FieldLabel htmlFor="location-id">{tf("personnel.location")}</FieldLabel><Select value={String(special.locationId ?? "")} disabled={Boolean(special.employeeId)} onValueChange={(value) => setSpecialValue("locationId", value ?? "")}><SelectTrigger id="location-id"><SelectValue /></SelectTrigger><SelectContent>{personnelLocations.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
        <div><FieldLabel htmlFor="employment-type">{tf("personnel.employmentType")}</FieldLabel><Select value={String(special.employmentType ?? "employee")} disabled={Boolean(special.employeeId)} onValueChange={(value) => setSpecialValue("employmentType", value ?? "employee")}><SelectTrigger id="employment-type"><SelectValue /></SelectTrigger><SelectContent>{payrollEmploymentTypes.map((item) => <SelectItem key={item} value={item}>{tf(`personnel.types.${item}`)}</SelectItem>)}</SelectContent></Select></div>
        <div><FieldLabel htmlFor="payroll-month">{tf("personnel.payrollMonth")}</FieldLabel><Input id="payroll-month" type="month" value={String(special.payrollMonth ?? "")} onChange={(e) => setSpecialValue("payrollMonth", e.target.value)} /></div>
        <div><FieldLabel htmlFor="grossSalary" help={tf("personnel.help.grossSalary")}>{tf("personnel.grossSalary")}</FieldLabel><Input id="grossSalary" inputMode="decimal" placeholder="0,00" value={String(special.grossSalary ?? "")} onChange={(e) => setSpecialValue("grossSalary", e.target.value)} /></div>
        {mode === "auto" && <>
          <div className="sm:col-span-2 grid gap-3 rounded-lg border bg-surface-raised p-3 sm:grid-cols-2">
            <div><FieldLabel htmlFor="external-payroll">{tf("personnel.externalPayroll")}</FieldLabel><Input id="external-payroll" inputMode="decimal" placeholder="0,00" value={String(special.externalPayroll ?? "")} onChange={(e) => setSpecialValue("externalPayroll", e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">{tf("personnel.externalPayrollHint")}</p></div>
            <div><FieldLabel htmlFor="external-marginal-payroll">{tf("personnel.externalMarginalPayroll")}</FieldLabel><Input id="external-marginal-payroll" inputMode="decimal" placeholder="0,00" value={String(special.externalMarginalPayroll ?? "")} onChange={(e) => setSpecialValue("externalMarginalPayroll", e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">{tf("personnel.externalMarginalPayrollHint")}</p></div>
          </div>
          {payrollCalculation ? <div className="sm:col-span-2 overflow-hidden rounded-xl border bg-card">
            <div className="flex items-start justify-between gap-4 border-b border-line-soft px-4 py-3"><div><h4 className="text-[14.5px] font-semibold">{tf("personnel.calculation")}</h4><p className="mt-0.5 text-xs text-muted-foreground">{location?.name} · {payrollCalculation.ruleVersion}</p></div><div className="text-right"><span className="text-[10.5px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{tf("personnel.netSalary")}</span><strong className="block text-lg font-semibold tabular-nums">{formatCents(payrollCalculation.netCents, locale)}</strong></div></div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 border-b border-line-soft px-4 py-2 text-[11.5px] font-medium text-muted-foreground"><span>{tf("personnel.component")}</span><span>{tf("personnel.basisRate")}</span><span>{tf("personnel.amount")}</span></div>
            {calculatedFields.map((field) => { const line = payrollCalculation.components[field]; return <div key={field} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 border-b border-line-soft px-4 py-2.5 text-[13.5px] last:border-b-0"><span className="min-w-0">{tf(`personnel.${field}`)}</span><span className="whitespace-nowrap text-xs text-muted-foreground tabular-nums">{line.rateBasisPoints === null ? tf("personnel.fixed") : `${formatCents(line.basisCents, locale)} × ${(line.rateBasisPoints / 100).toLocaleString(locale, { minimumFractionDigits: 2 })} %`}</span><strong className="w-24 text-right font-semibold tabular-nums">{formatCents(line.amountCents, locale)}</strong></div>; })}
            <div className="grid gap-3 border-t bg-surface-raised px-4 py-3 sm:grid-cols-3"><div><span className="text-[10.5px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{tf("personnel.taxableAnnual")}</span><strong className="block tabular-nums">{formatCents(payrollCalculation.taxableAnnualIncomeCents, locale)}</strong></div><div><span className="text-[10.5px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{tf("personnel.marginalRate")}</span><strong className="block tabular-nums">{payrollCalculation.marginalTaxRatePercent} %</strong></div><div><span className="text-[10.5px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{tf("personnel.total")}</span><strong className="block tabular-nums">{formatCents(payrollCalculation.employerTotalCents, locale)}</strong></div></div>
          </div> : <div className="sm:col-span-2 rounded-lg border border-dashed border-line-strong p-3 text-text-secondary text-sm">{tf("personnel.incompleteAuto")}</div>}
          <div><FieldLabel htmlFor="otherPersonnelCost" help={tf("personnel.help.otherPersonnelCost")}>{tf("personnel.otherPersonnelCost")}</FieldLabel><Input id="otherPersonnelCost" inputMode="decimal" placeholder="0,00" value={String(special.otherPersonnelCost ?? "")} onChange={(e) => setSpecialValue("otherPersonnelCost", e.target.value)} /></div>
          {payrollCalculation && <div className="self-end text-xs leading-5 text-muted-foreground">{payrollCalculation.warnings.map((warning) => <p key={warning}>• {tf(`personnel.warnings.${warning}`)}</p>)}</div>}
        </>}
        {mode === "manual" && <>
          {manualFields.map((field) => <div key={field}><FieldLabel htmlFor={field} help={tf(`personnel.help.${field}`)}>{tf(`personnel.${field}`)}</FieldLabel><Input id={field} inputMode="decimal" placeholder="0,00" value={String(special[field] ?? "")} onChange={(e) => setSpecialValue(field, e.target.value)} /></div>)}
          <div><FieldLabel htmlFor="otherPersonnelCost" help={tf("personnel.help.otherPersonnelCost")}>{tf("personnel.otherPersonnelCost")}</FieldLabel><Input id="otherPersonnelCost" inputMode="decimal" placeholder="0,00" value={String(special.otherPersonnelCost ?? "")} onChange={(e) => setSpecialValue("otherPersonnelCost", e.target.value)} /></div>
          <div className="sm:col-span-2"><FieldLabel htmlFor="payroll-override-reason">{tf("personnel.overrideReason")}</FieldLabel><Textarea id="payroll-override-reason" rows={2} value={String(special.overrideReason ?? "")} onChange={(e) => setSpecialValue("overrideReason", e.target.value)} placeholder={tf("personnel.overrideReasonPlaceholder")} /></div>
        </>}
        <div className="sm:col-span-2 mt-2 border-t border-line-soft pt-4"><h4 className="text-[14.5px] font-semibold">{tf("personnel.paymentDates")}</h4><p className="mt-1 text-xs text-muted-foreground">{tf("personnel.paymentDatesHint")}</p></div>
        {(["employeePaymentDate", "socialPaymentDate", "taxPaymentDate", "municipalPaymentDate", "provisionPaymentDate"] as const).map((field) => <div key={field}><FieldLabel htmlFor={field}>{tf(`personnel.${field}`)}</FieldLabel><Input id={field} type="date" value={String(special[field] ?? date)} onChange={(e) => setSpecialValue(field, e.target.value)} /></div>)}
        <div className="sm:col-span-2 flex items-center justify-between rounded-lg border bg-surface-raised px-4 py-3"><span>{tf("personnel.total")}</span><strong className="font-semibold tabular-nums">{formatCents(personnelCostCents ?? 0, locale)}</strong></div>
        <div className="sm:col-span-2 flex items-center justify-between rounded-lg border bg-card px-4 py-3"><span>{tf("personnel.paymentTotal")}</span><strong className="font-semibold tabular-nums">{formatCents(paymentTotal, locale)}</strong></div>
        <p className="sm:col-span-2 text-xs leading-5 text-muted-foreground">{mode === "auto" ? tf("personnel.automationNotice") : tf("personnel.manualNotice")}</p>
      </FormSection>
    );
  }
  if (template === "svs" || template === "tax_levy") return (
    <FormSection title={tf("categoryDetails")} description={tf(`templates.${template}.description`)}>
      <div><FieldLabel htmlFor="authority" help={template === "svs" ? tf("help.svsAuthority") : tf("help.taxAuthority")}>{tf("authority")}</FieldLabel><Input id="authority" value={String(special.authority ?? (template === "svs" ? "SVS" : ""))} onChange={(e) => setSpecialValue("authority", e.target.value)} /></div>
      {template === "tax_levy" && <div><FieldLabel htmlFor="levy-type" help={tf("help.levyType")}>{tf("levyType")}</FieldLabel><Input id="levy-type" value={String(special.levyType ?? "")} onChange={(e) => setSpecialValue("levyType", e.target.value)} /></div>}
      <div className={template === "svs" ? "" : "sm:col-span-2"}><FieldLabel htmlFor="assessment-period" help={tf("help.assessmentPeriod")}>{tf("assessmentPeriod")}</FieldLabel><Input id="assessment-period" value={String(special.assessmentPeriod ?? "")} onChange={(e) => setSpecialValue("assessmentPeriod", e.target.value)} /></div>
    </FormSection>
  );
  return null;
}
