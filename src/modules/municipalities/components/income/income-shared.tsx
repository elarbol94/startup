"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, type ReactNode } from "react";
import type { DigitalPlatformProviderCategory } from "../../digital-platforms";
import { INCOME_CATEGORIES, type IncomeCategoryId } from "../../income";
import { POPULATION_CLASSES } from "../../population";

/** Five reading groups for composition bars; the tables list all thirteen categories. */
export const INCOME_GROUPS = [
  { id: "ownTaxes", color: "#1b8377", categories: ["communalTax", "propertyTax", "otherOwnTaxes"] },
  { id: "sharedTaxes", color: "#2056a7", categories: ["sharedTaxes"] },
  { id: "charges", color: "#c68231", categories: ["fees", "services", "property", "otherOperating", "financialIncome"] },
  { id: "transfers", color: "#7f5ca7", categories: ["transfersFederal", "transfersState", "transfersOther"] },
  { id: "investive", color: "#6b7280", categories: ["investive"] },
] as const satisfies ReadonlyArray<{ id: string; color: string; categories: readonly IncomeCategoryId[] }>;

export type IncomeGroupId = (typeof INCOME_GROUPS)[number]["id"];

/** Group sums from a category vector ordered like INCOME_CATEGORIES. */
export function incomeGroupSums(categories: number[]) {
  return INCOME_GROUPS.map((group) => ({
    ...group,
    value: group.categories.reduce((sum, id) => sum + categories[INCOME_CATEGORIES.findIndex((category) => category.id === id)], 0),
  }));
}

export function useIncomeFormats() {
  const locale = useLocale();
  return useMemo(() => ({
    locale,
    currency: new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }),
    compactCurrency: new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", notation: "compact", minimumFractionDigits: 1, maximumFractionDigits: 1 }), // fixed digits: Node and browser ICU trim trailing zeros differently
    integer: new Intl.NumberFormat(locale),
    percent: new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 }),
    signedPercent: new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1, signDisplay: "exceptZero" }),
  }), [locale]);
}

export type IncomeFormats = ReturnType<typeof useIncomeFormats>;

export function formatOrDash(format: Intl.NumberFormat, value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value) ? "—" : format.format(value);
}

export function StatGrid({ label, items }: { label: string; items: Array<{ label: string; value: string; note?: ReactNode }> }) {
  return (
    <section className="grid overflow-hidden rounded-xl border bg-card shadow-card sm:grid-cols-2 xl:grid-cols-4" aria-label={label}>
      {items.map((item) => (
        <div key={item.label} className="px-[18px] py-4 shadow-[1px_0_0_var(--border),0_1px_0_var(--border)]">
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p className="mt-1 text-[22px] leading-tight font-semibold tabular-nums">{item.value}</p>
          {item.note ? <p className="mt-0.5 text-xs text-muted-foreground">{item.note}</p> : null}
        </div>
      ))}
    </section>
  );
}

export function Filter({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground"><span>{label}</span>{children}</label>;
}

export const SELECT_CLASS = "h-9 w-full rounded-lg border bg-background px-3 text-sm text-foreground";

/** One horizontal 100 % bar with a text legend, so the split never depends on colour alone. */
export function CompositionBar({ categories, groupLabel, formats, label }: {
  categories: number[];
  groupLabel: (id: IncomeGroupId) => string;
  formats: IncomeFormats;
  label: string;
}) {
  const groups = incomeGroupSums(categories);
  const total = groups.reduce((sum, { value }) => sum + Math.max(0, value), 0);
  return (
    <div className="grid gap-3">
      <div className="flex h-4 overflow-hidden rounded-full bg-muted" role="img" aria-label={label}>
        {total > 0 ? groups.map((group) => (
          <span key={group.id} style={{ width: `${(Math.max(0, group.value) / total) * 100}%`, background: group.color }} />
        )) : null}
      </div>
      <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
        {groups.map((group) => (
          <li key={group.id} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: group.color }} />
            <span className="min-w-0 flex-1 truncate">{groupLabel(group.id)}</span>
            <span className="tabular-nums text-muted-foreground">{total > 0 ? formats.percent.format(group.value / total) : "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Relative bar for table cells; negative values grow in the other colour from zero. */
export function ValueBar({ value, maximum }: { value: number; maximum: number }) {
  const width = maximum > 0 ? Math.min(100, (Math.abs(value) / maximum) * 100) : 0;
  return (
    <span aria-hidden className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <span className={value < 0 ? "block h-full bg-destructive" : "block h-full bg-brand"} style={{ width: `${width}%` }} />
    </span>
  );
}

const PROVIDER_NAMES = { gem2go: "GEM2GO", cities: "CITIES", gemeinde24: "Gemeinde24", gemeindeapp: "GemeindeApp", "daheim-app": "Daheim App" } as const;

/** Same names the overview map uses for its provider legend. */
export function useProviderLabel() {
  const t = useTranslations("municipalities");
  const ti = useTranslations("municipalityIncome");
  return (category: DigitalPlatformProviderCategory | null) =>
    category === null ? ti("providerUnknown")
      : category === "none" ? t("digitalProviderNone")
        : category === "local-app" ? t("digitalProviderLocal")
          : category === "multiple" ? t("digitalProviderMultiple")
            : PROVIDER_NAMES[category];
}

export function populationClassLabel(index: number, integer: Intl.NumberFormat) {
  const item = POPULATION_CLASSES[index];
  return `${integer.format(item.minimum)}${item.maximum === null ? "+" : `–${integer.format(item.maximum)}`}`;
}
