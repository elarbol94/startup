// First step of the entry dialog: search and pick a category, grouped into expenses and
// income, with the template icon and description. Used by entry-dialog.tsx.
"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  BriefcaseBusiness,
  Car,
  CircleDollarSign,
  HandCoins,
  Landmark,
  Plane,
  ReceiptText,
  Search,
  Users,
  Utensils,
} from "lucide-react";
import type { CategoryTemplate } from "@/modules/accounting/schema";
import { DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Category } from "./entry-dialog-types";

const TEMPLATE_ICONS = {
  standard_income: CircleDollarSign,
  grant_income: HandCoins,
  standard_expense: ReceiptText,
  hospitality: Utensils,
  travel: Plane,
  vehicle: Car,
  asset: BriefcaseBusiness,
  personnel: Users,
  svs: Landmark,
  tax_levy: Landmark,
} satisfies Record<CategoryTemplate, typeof ReceiptText>;

export function EntryCategoryStep({
  categories,
  canManagePersonnel,
  search,
  setSearch,
  chooseCategory,
}: {
  categories: Category[];
  canManagePersonnel: boolean;
  search: string;
  setSearch: (value: string) => void;
  chooseCategory: (next: Category) => void;
}) {
  const t = useTranslations("accounting");
  const tf = useTranslations("accountingEntry");
  const locale = useLocale();
  const filteredCategories = categories.filter(
    (item) =>
      !item.archived &&
      (canManagePersonnel || item.template !== "personnel") &&
      (!search.trim() || item.name.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale))),
  );

  return (
    <div className="p-5 sm:p-7">
      <DialogHeader>
        <p className="text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{tf("stepOne")}</p>
        <DialogTitle className="text-[22px] font-semibold tracking-[-0.025em]">{tf("chooseCategory")}</DialogTitle>
        <p className="max-w-2xl text-[13.5px] leading-6 text-muted-foreground">{tf("chooseCategoryDescription")}</p>
      </DialogHeader>
      <div className="relative mt-5"><Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tf("searchCategories")} className="h-10 pl-9" autoFocus /></div>
      {(["expense", "income"] as const).map((group) => {
        const items = filteredCategories.filter((item) => item.kind === group);
        if (!items.length) return null;
        return <section key={group} className="mt-6"><h3 className="mb-3 text-[11px] font-semibold tracking-[0.12em] text-text-tertiary uppercase">{group === "expense" ? t("expensePlural") : t("incomePlural")}</h3><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => { const Icon = TEMPLATE_ICONS[item.template]; return <button key={item.id} type="button" onClick={() => chooseCategory(item)} className="group rounded-xl border bg-card p-4 text-left shadow-card transition-colors outline-none hover:border-line-strong hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"><span className="flex items-start justify-between gap-3"><span className="flex size-9 items-center justify-center rounded-lg bg-brand-soft text-brand-ink"><Icon className="size-4.5" /></span><span className="mt-1 size-2.5 rounded-full" style={{ backgroundColor: item.color }} /></span><strong className="mt-4 block text-[13.5px] font-semibold">{item.name}</strong><span className="mt-1.5 block text-xs leading-5 text-muted-foreground">{tf(`templates.${item.template}.description`)}</span></button>; })}</div></section>;
      })}
    </div>
  );
}
