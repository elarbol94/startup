"use client";
import { FILTER_METRICS, filterMetricLabel, filterMetricUnit } from "../filter-metrics";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { conditionSchema } from "../filters";
import { useTranslations } from "next-intl";
import { defaultCondition, filterFields, filterStates, providerNames, type FilterCondition, type FilterField } from "../filters";
import { DIGITAL_PLATFORM_PROVIDER_FAMILIES } from "../digital-platforms";

const selectClass = "h-10 w-full min-w-0 max-w-full rounded-md border bg-background px-2 text-sm";
export function MunicipalityConditionEditor({ value, onChange }: { value: FilterCondition; onChange: (value: FilterCondition) => void }) {
  const t = useTranslations("municipalityFilters");
  const tm = useTranslations("municipalities");
  return <div className="@container grid min-w-0 flex-1 grid-cols-2 items-end gap-3">
    <label className="col-span-2 grid min-w-0 max-w-full gap-1.5 text-xs"><span>{t("field")}</span><select className={selectClass} value={value.field} onChange={e => onChange(defaultCondition(e.target.value as FilterField))}>{filterFields.map(field => <option key={field} value={field}>{t(`fields.${field}`)}</option>)}</select></label>
    {value.field === "metric" && <label className="col-span-2 grid min-w-0 max-w-full gap-1.5 text-xs">{t("fields.metric")}<select className={selectClass} value={value.metricId} onChange={e => onChange({ ...value, metricId: e.target.value })}>{FILTER_METRICS.map(metric => <option key={metric.id} value={metric.id}>{filterMetricLabel(metric.id, tm)} ({filterMetricUnit(metric.id, tm)})</option>)}</select></label>}
    {"values" in value ? <fieldset className="col-span-2 min-w-0"><legend className="mb-1 text-xs">{t("containsAny")}</legend><div className="flex flex-wrap gap-2 rounded-md border p-2">{(value.field === "state" ? filterStates : DIGITAL_PLATFORM_PROVIDER_FAMILIES).map(item => <label key={item} className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={(value.values as string[]).includes(item)} onChange={e => onChange({ ...value, values: e.target.checked ? [...value.values, item] : value.values.filter(v => v !== item) } as FilterCondition)} />{value.field === "state" ? item : item === "local-app" ? t("localProvider") : providerNames[item as keyof typeof providerNames]}</label>)}</div></fieldset>
      : value.field === "availability" || value.field === "research" ? <label className="grid min-w-0 max-w-full gap-1.5 text-xs"><span>{t("value")}</span><select className={selectClass} value={value.value} onChange={e => onChange({ ...value, value: e.target.value } as FilterCondition)}>{(value.field === "availability" ? ["found", "none", "unknown"] : ["complete", "partial", "unknown"]).map(item => <option key={item} value={item}>{t(`values.${item}`)}</option>)}</select></label>
        : <><label className="grid min-w-0 max-w-full gap-1.5 text-xs"><span>{t("operator")}</span><select className={selectClass} value={value.operator} onChange={e => onChange({ ...value, operator: e.target.value, upper: value.upper ?? value.value } as FilterCondition)}>{["gt", "gte", "lt", "lte", "eq", "between"].map(op => <option key={op} value={op}>{t(`operators.${op}`)}</option>)}</select></label><label className="grid min-w-0 max-w-full gap-1.5 text-xs"><span>{t("value")}</span><input className={selectClass} type="number" min={value.field === "metric" ? undefined : 0} step="any" value={Number.isFinite(value.value) ? value.value : ""} onChange={e => onChange({ ...value, value: e.target.valueAsNumber })} /></label>{value.operator === "between" && <label className="grid min-w-0 max-w-full gap-1.5 text-xs"><span>{t("upper")}</span><input className={selectClass} type="number" min={value.value} step="any" value={value.upper ?? ""} onChange={e => onChange({ ...value, upper: e.target.valueAsNumber })} /></label>}</>}
    <label className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={value.negate} onChange={e => onChange({ ...value, negate: e.target.checked })} />{t("negate")}</label>
  </div>;
}

export function ConditionNodeEditor({ value, onSave }: { value: FilterCondition; onSave: (value: FilterCondition) => void }) {
  const t = useTranslations("municipalityFilters");
  const [draft, setDraft] = useState(value);
  return <div className="space-y-2"><MunicipalityConditionEditor value={draft} onChange={setDraft} /><Button size="sm" disabled={!conditionSchema.safeParse(draft).success} onClick={() => onSave(draft)}>{t("applyCondition")}</Button></div>;
}
export function conditionLabel(rule: FilterCondition, t: (key: string) => string, tm?: (key: string) => string): string {
  const value = "values" in rule ? rule.values.map(value => rule.field === "providers" ? value === "local-app" ? t("localProvider") : providerNames[value as keyof typeof providerNames] : value).join(", ") : typeof rule.value === "string" ? t(`values.${rule.value}`) : `${rule.value}${rule.operator === "between" ? `–${rule.upper}` : ""}`;
  const operator = "values" in rule ? t("containsAny") : typeof rule.value === "string" ? "=" : t(`operators.${rule.operator}`);
  return `${rule.negate ? `${t("negate")} · ` : ""}${rule.field === "metric" ? tm ? `${filterMetricLabel(rule.metricId, tm)} (${filterMetricUnit(rule.metricId, tm)})` : `${t("fields.metric")} · ${rule.metricId}` : t(`fields.${rule.field}`)} ${operator} ${value}`;
}
