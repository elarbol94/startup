import type { PayrollEmploymentType } from "@/modules/accounting/lib/payroll-at-2026";
import type { PersonnelWorkspaceData } from "../../queries";
import type { Text } from "./personnel-copy";

export const tabs = ["overview", "people", "calculator", "projects", "funding", "scenarios", "rules"] as const;
export type Tab = (typeof tabs)[number];

export type RunAction = (action: () => Promise<unknown>, success: string) => void;
export type PanelProps = { data: PersonnelWorkspaceData; t: Text; locale: string; pending: boolean; run: RunAction };

export type CalculatorState = {
  year: number;
  inputMode: "gross" | "net";
  amount: string;
  employmentType: PayrollEmploymentType;
  locationId: string;
  weeklyHours: string;
  vacationWeeks: string;
  sickHours: string;
  trainingHours: string;
  internalHours: string;
  overhead: string;
  markup: string;
  specialPayments: boolean;
  taxableBenefits: string;
  commuterAllowance: string;
  commuterEuro: string;
  familyBonus: string;
};

export const euro = (cents: number, locale: string) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(cents / 100);
export const number = (value: number, locale: string, digits = 1) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
export const decimal = (value: string) => Number(value.replace(",", ".")) || 0;
export const money = (value: string) => Math.round(decimal(value) * 100);

export const employmentLabels: Record<
  PayrollEmploymentType,
  { de: string; en: string }
> = {
  worker: { de: "Arbeiter/in", en: "Worker" },
  employee: { de: "Angestellte/r", en: "Employee" },
  marginal: { de: "Geringfügig", en: "Marginal employment" },
  apprentice: { de: "Lehrling", en: "Apprentice" },
  freelance: { de: "Freie/r Dienstnehmer/in", en: "Freelance employee" },
  managing_director_asvg: { de: "Geschäftsführung ASVG", en: "Managing director (ASVG)" },
  shareholder_managing_director_gsvg: { de: "Geschäftsführung GSVG", en: "Shareholder managing director (GSVG)" },
};

export function employmentLabel(type: string, locale: string) {
  const normalized =
    type === "managing_director" ? "managing_director_asvg" : type;
  const labels = employmentLabels[normalized as PayrollEmploymentType];
  return labels?.[locale.startsWith("de") ? "de" : "en"] ?? type;
}

export function employeePlanFromCalculator(calc: CalculatorState, locationId: string) {
  return {
    name: "Szenario", personnelNumber: "", userId: null, birthDate: null, collectiveAgreement: "",
    locationId, joinedOn: `${calc.year}-01-01`, leftOn: null, validFrom: `${calc.year}-01-01`,
    employmentType: calc.employmentType, inputMode: calc.inputMode, monthlyAmountCents: money(calc.amount),
    weeklyMinutes: Math.round(Number(calc.weeklyHours.replace(",", ".")) * 60), workdaysPerWeek: 5,
    specialPaymentsEnabled: calc.specialPayments, holidayPayMonth: 6, christmasPayMonth: 11,
    vacationWeeksHundredths: Math.round(decimal(calc.vacationWeeks) * 100),
    expectedSickHoursHundredths: Math.round(decimal(calc.sickHours) * 100),
    trainingHoursHundredths: Math.round(decimal(calc.trainingHours) * 100),
    internalHoursHundredths: Math.round(decimal(calc.internalHours) * 100),
    overheadRateBasisPoints: Math.round(decimal(calc.overhead) * 100),
    salesMarkupBasisPoints: Math.round(decimal(calc.markup) * 100),
    taxableBenefitsCents: money(calc.taxableBenefits), commuterAllowanceCents: money(calc.commuterAllowance),
    commuterEuroCents: money(calc.commuterEuro), familyBonusCents: money(calc.familyBonus),
    soleEarnerCreditCents: 0, singleParentCreditCents: 0,
  };
}
