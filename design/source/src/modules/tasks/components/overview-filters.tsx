"use client";
import { useTranslations } from "next-intl";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOverviewPreference } from "./overview-preferences";
export { matchesOverviewFilters } from "../overview-filter-model";
export type FilterField = { id: string; label: string; type?: "date" | "search"; options?: { value: string; label: string }[] };
export function useOverviewFilters(id: string, fields: FilterField[]) {
  const storage = useOverviewPreference(`filters:${id}`);
  let raw: Record<string, unknown> = {};
  try { raw = JSON.parse(storage.raw ?? "{}") ?? {}; } catch { /* Recover invalid stored preferences. */ }
  const values: Record<string, string> = Object.fromEntries(fields.map(field => {
    const value = typeof raw[field.id] === "string" ? raw[field.id] as string : "";
    return [field.id, field.options && !field.options.some(option => option.value === value) ? "" : field.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value) ? "" : value];
  }));
  return { fields, values, failed: storage.failed, set: (id: string, value: string) => storage.save({ ...values, [id]: value }), reset: () => storage.save({}) };
}
export function OverviewFilters({ filters }: { filters: ReturnType<typeof useOverviewFilters> }) {
  const t = useTranslations("overviewLayout");
  const active = filters.fields.filter(field => filters.values[field.id]);
  return <div className="flex w-full flex-wrap items-center gap-1.5">
    <Popover><PopoverTrigger render={<Button variant="outline" size="sm" />}><SlidersHorizontal className="size-3.5" />{t("filter")}{!!active.length && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{active.length}</span>}</PopoverTrigger>
      <PopoverContent align="start" className="max-h-[70dvh] w-72 space-y-3 overflow-y-auto p-4">
        {filters.fields.map(field => <label key={field.id} className="block space-y-1 text-xs text-muted-foreground"><span>{field.label}</span>{field.options ? <select aria-label={field.label} value={filters.values[field.id]} onChange={event => filters.set(field.id, event.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground"><option value="">{t("allValues")}</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <Input aria-label={field.label} type={field.type ?? "search"} value={filters.values[field.id]} onChange={event => filters.set(field.id, event.target.value)} />}</label>)}
        <Button variant="ghost" size="sm" onClick={filters.reset}>{t("resetFilters")}</Button>
      </PopoverContent>
    </Popover>
    {active.map(field => <button key={field.id} type="button" onClick={() => filters.set(field.id, "")} aria-label={t("removeFilter", { filter: field.label })} className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"><span className="truncate">{field.label}: {field.options?.find(option => option.value === filters.values[field.id])?.label ?? filters.values[field.id]}</span><X className="size-3 shrink-0" /></button>)}
    {filters.failed && <span role="status" className="text-xs text-destructive">{t("saveFailed")}</span>}
  </div>;
}
export const filterOptions = (values: (string | null | undefined)[]) => [...new Set(values.filter((value): value is string => !!value))].sort((a, b) => a.localeCompare(b)).map(value => ({ value, label: value }));
