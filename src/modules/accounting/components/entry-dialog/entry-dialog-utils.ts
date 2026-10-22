// Template sets, date shifting and tax-line defaults of the accounting entry dialog.
// Used by entry-dialog.tsx.
import type { CategoryTemplate } from "@/modules/accounting/schema";
import { toLocalIsoDate } from "../../lib/date";
import type { TaxLineState } from "./entry-dialog-types";

export const NON_VAT_TEMPLATES = new Set<CategoryTemplate>(["personnel", "svs", "tax_levy", "grant_income"]);
export const EVIDENCE_TEMPLATES = new Set<CategoryTemplate>([
  "hospitality",
  "travel",
  "vehicle",
  "asset",
  "personnel",
]);

export function todayIso() {
  return toLocalIsoDate();
}

export function nextMonth(value: string) {
  const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (!match) return value;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const next = new Date(Date.UTC(year, monthIndex + 1, 1));
  if (!match[3]) return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(Number(match[3]), lastDay);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function moneyText(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function newLine(vatRate = 20, inputVatDeductiblePercent = 100): TaxLineState {
  return {
    key: crypto.randomUUID(),
    description: "",
    amountText: "",
    mode: "gross",
    vatRate,
    inputVatDeductiblePercent,
  };
}
