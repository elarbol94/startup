"use client";

import { FILTER_METRICS, filterMetricLabel, filterMetricUnit } from "../filter-metrics";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { defaultCondition, filterFields, filterStates, providerNames, readFilterField, type FilterCondition, type FilterField, type Match } from "../filters";
import type { loadMunicipalityFilterData } from "../analysis-data";
import { DIGITAL_PLATFORM_PROVIDER_COLORS } from "../provider-colors";
import { MUNICIPALITY_SEQUENTIAL_COLORS } from "../palette";
import { POPULATION_CLASSES } from "../population";
import { conditionLabel } from "./municipality-condition-editor";
const FilterMap = dynamic(() => import("./municipality-filter-map"), { ssr: false });
const inputClass = "h-9 min-w-0 max-w-full rounded-md border bg-background px-2 text-sm";
const UNKNOWN_COLOR = "#b4b4ae";
type Data = Awaited<ReturnType<typeof loadMunicipalityFilterData>>;
export function MunicipalityFilterExplorer({ data, year, results, valid, groups, onAdd }: { data: Data; year: number; results: Record<string, Match>; valid: boolean; groups: Array<{ index: number; available: boolean }>; onAdd: (group: number, condition: FilterCondition) => void }) {
  const t = useTranslations("municipalityFilters");
  const format = useFormatter();
  const tm = useTranslations("municipalities");
  const [metricId, setMetricId] = useState("population-density");
  const unit = filterMetricUnit(metricId, tm);
  const [mode, setMode] = useState("raw");
  const [field, setField] = useState<FilterField>("population");
  const [selectedCode, setSelectedCode] = useState("");
  const [targetGroup, setTargetGroup] = useState(0);
  const selected = data.index.municipalities.find(item => item.municipalityCode === selectedCode);
  const category = field === "metric" ? "metrics" : ["population", "area", "state"].includes(field) ? "geography" : "digital";
  const fields = filterFields.filter(item => item !== "metric" && (["population", "area", "state"].includes(item) ? "geography" : "digital") === category);
  const values = useMemo(() => Object.fromEntries(data.index.municipalities.map(item => [item.municipalityCode, readFilterField(field, item, year, data, metricId)])), [data, field, year, metricId]);
  const raw = selected ? values[selected.municipalityCode] : null;
  function providerLabel(value: string) { return value === "none" ? t("values.none") : value === "multiple" ? t("explorer.multiple") : value === "local-app" ? t("localProvider") : providerNames[value as keyof typeof providerNames]; }
  const label = (value: typeof raw): string => value === null ? t("values.unknown") : Array.isArray(value) ? value.length ? value.map(providerLabel).join(", ") : t("values.none") : typeof value === "number" ? format.number(value, { maximumFractionDigits: 2 }) : field === "state" ? value : t(`values.${value}`);
  let legend: Array<{ key: string; color: string; label: string }>;
  const numeric = Object.values(values).filter((value): value is number => typeof value === "number");
  const maximum = numeric.length ? Math.max(...numeric) : 0;
  const minimum = numeric.length ? Math.min(...numeric) : 0;
  const span = maximum - minimum;
  const breaks = Array.from({ length: 5 }, (_, index) => minimum + span * index / 5);
  if (field === "providers") legend = Object.entries(DIGITAL_PLATFORM_PROVIDER_COLORS).map(([key, color]) => ({ key, color, label: providerLabel(key) }));
  else if (field === "state") legend = filterStates.map((state, index) => ({ key: state, color: ["#2563eb", "#e11d48", "#f59e0b", "#16a34a", "#7c3aed", "#0891b2", "#a16207", "#db2777", "#334155"][index], label: state }));
  else if (field === "availability" || field === "research") legend = (field === "availability" ? ["none", "found"] : ["partial", "complete"]).map((key, index) => ({ key, color: index ? "#0d9488" : "#f59e0b", label: t(`values.${key}`) }));
  else if (field === "population") legend = POPULATION_CLASSES.map((item, index) => ({ key: String(index), color: item.color, label: `${format.number(item.minimum)}${item.maximum === null ? "+" : `–${format.number(item.maximum)}`}` }));
  else legend = span === 0 ? [{ key: "0", color: MUNICIPALITY_SEQUENTIAL_COLORS[0], label: format.number(minimum) }] : breaks.map((minimum, index) => ({ key: String(index), color: MUNICIPALITY_SEQUENTIAL_COLORS[index], label: `${format.number(minimum, { maximumFractionDigits: 2 })} – ${index < 4 ? "< " : ""}${format.number(index < 4 ? breaks[index + 1] : maximum, { maximumFractionDigits: 2 })}` }));
  const palette = Object.fromEntries(legend.map(item => [item.key, item.color]));
  const colors = Object.fromEntries(Object.entries(values).map(([code, value]) => {
    let key: string;
    if (value === null) return [code, UNKNOWN_COLOR];
    if (Array.isArray(value)) key = value.length > 1 ? "multiple" : value[0] ?? "none";
    else if (typeof value === "string") key = value;
    else if (field === "population") key = String(POPULATION_CLASSES.findIndex(item => value >= item.minimum && (item.maximum === null || value <= item.maximum)));
    else key = span === 0 ? "0" : String(Math.max(0, Math.min(4, Math.floor((value - minimum) / span * 5))));
    return [code, palette[key] ?? UNKNOWN_COLOR];
  }));
  const mapResults = Object.fromEntries(data.index.municipalities.map(item => [item.municipalityCode, results[item.municipalityCode] ?? null]));
  let condition = defaultCondition(field);
  if (condition.field === "metric") condition = { ...condition, metricId };
  if (selected && raw !== null) {
    if (field === "providers" && Array.isArray(raw)) condition = raw.length ? { field, operator: "in", values: raw as Extract<FilterCondition, { field: "providers" }>["values"], negate: false } : defaultCondition("availability");
    else if (field === "state") condition = { field, operator: "in", values: [selected.state], negate: false };
    else if (typeof raw === "number" && "value" in condition) condition = { ...condition, operator: "eq", value: raw } as FilterCondition;
    else if (field === "availability" || field === "research") condition = { field, operator: "eq", value: raw, negate: false } as FilterCondition;
  } else if (selected && (field === "availability" || field === "research")) condition = { field, operator: "eq", value: "unknown", negate: false };
  const group = groups.find(item => item.index === targetGroup && item.available) ?? groups.find(item => item.available);
  return <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4" aria-label={t("explorer.title")} data-testid="filter-explorer">
    <h2 className="text-lg font-semibold">{t("explorer.title")}</h2>
    <div className="flex flex-wrap gap-2">
      <label className="grid min-w-0 gap-1 text-xs">{t("explorer.display")}<select className={inputClass} value={mode} onChange={e => setMode(e.target.value)}><option value="raw">{t("explorer.raw")}</option><option value="results" disabled={!valid}>{t("results")}</option></select></label>
      <label className="grid min-w-0 gap-1 text-xs">{t("explorer.category")}<select className={inputClass} value={category} onChange={e => setField(e.target.value === "metrics" ? "metric" : e.target.value === "digital" ? "providers" : "population")}><option value="geography">{t("explorer.geography")}</option><option value="digital">{t("explorer.digital")}</option><option value="metrics">{t("fields.metric")}</option></select></label>
      <label className="grid min-w-0 flex-1 gap-1 text-xs">{t("explorer.layer")}<select className={inputClass} value={field === "metric" ? metricId : field} onChange={e => field === "metric" ? setMetricId(e.target.value) : setField(e.target.value as FilterField)}>{field === "metric" ? FILTER_METRICS.map(metric => <option key={metric.id} value={metric.id}>{filterMetricLabel(metric.id, tm)} ({filterMetricUnit(metric.id, tm)})</option>) : fields.map(item => <option key={item} value={item}>{t(`fields.${item}`)}</option>)}</select></label>
    </div>
    <p className="text-xs text-muted-foreground">{field === "metric" ? t("explorer.metricDate", { year, unit }) : field === "population" ? t("explorer.populationDate", { year }) : category === "digital" ? t("snapshotDate", { date: data.digital.referenceDate }) : t("explorer.referenceDate", { date: data.index.datasetDate })}</p>
    <FilterMap results={mapResults} colors={mode === "raw" || !valid ? colors : undefined} onSelect={setSelectedCode} />
    {mode === "raw" || !valid ? <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">{[...legend, { key: "unknown", label: t("values.unknown"), color: UNKNOWN_COLOR }].map(item => <span className="flex items-center gap-1.5" key={item.key}><span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />{item.label}</span>)}</div> : null}
    {!valid && mode === "results" && <p className="text-xs text-muted-foreground">{t("explorer.invalidResults")}</p>}
    <p className="text-xs text-muted-foreground">{t("explorer.mapHint")}</p>
    {selected && <div className="space-y-1 rounded-lg bg-muted/40 p-3 text-sm" aria-live="polite"><h3 className="font-semibold">{selected.name}</h3><p>{field === "metric" ? filterMetricLabel(metricId, tm) : t(`fields.${field}`)}: {label(raw)}{field === "metric" && raw !== null ? ` ${unit}` : ""}</p><p className="text-xs text-muted-foreground">{selected.state} · {selected.municipalityCode}</p>{category === "digital" && <p className="text-xs">{t("fields.research")}: {t(`values.${data.digital.municipalities[selectedCode]?.researchStatus ?? "unknown"}`)} · {data.digital.municipalities[selectedCode]?.checkedAt ?? "—"}</p>}<Link href={`/municipalities/overview?municipality=${selectedCode}&populationYear=${year}`} target="_blank" className="inline-block text-xs underline">{t("explorer.details")}</Link></div>}
    {mode === "results" && valid && <div className="space-y-2 border-t pt-3">
    <div className="flex flex-wrap items-end gap-2"><label className="grid gap-1 text-xs">{t("explorer.target")}<select className={inputClass} value={group?.index ?? ""} disabled={!group} onChange={e => setTargetGroup(Number(e.target.value))}>{groups.map(item => <option key={item.index} value={item.index} disabled={!item.available}>{t("group", { number: item.index + 1 })}</option>)}</select></label><Button disabled={!group} onClick={() => { if (group) onAdd(group.index, condition); }}>{t("explorer.add")}</Button></div>
    <p className="text-xs text-muted-foreground">{conditionLabel(condition, t, tm)}</p>
    </div>}
  </section>;
}
