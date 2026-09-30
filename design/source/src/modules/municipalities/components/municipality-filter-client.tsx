"use client";
import { createMunicipalityFilterAnalysis } from "../actions";
import { MunicipalityFilterExplorer } from "./municipality-filter-explorer";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadMunicipalityFilterData } from "../analysis-data";
import { defaultCondition, evaluateMunicipalityFilter, exampleMunicipalityFilter, initialMunicipalityFilter, municipalityFilterSchema, type MunicipalityFilter, type Match } from "../filters";
import { MunicipalityConditionEditor } from "./municipality-condition-editor";
const selectClass = "h-9 min-w-0 max-w-full rounded-md border bg-background px-2 text-sm";
function readFilter(query: string | null): MunicipalityFilter | null {
  if (!query) return initialMunicipalityFilter;
  try { return query.length <= 20000 ? municipalityFilterSchema.parse(JSON.parse(query)) : null; } catch { return null; }
}
export function MunicipalityFilterClient() {
  const params = useSearchParams();
  const query = params.get("filter");
  return <FilterWorkspace key={query ?? ""} query={query} />;
}
function FilterWorkspace({ query }: { query: string | null }) {
  const t = useTranslations("municipalityFilters");
  const format = useFormatter();
  const router = useRouter();
  const [filter, setFilter] = useState<MunicipalityFilter>(() => readFilter(query) ?? initialMunicipalityFilter);
  const [data, setData] = useState<Awaited<ReturnType<typeof loadMunicipalityFilterData>> | null>(null);
  const [error, setError] = useState(false);
  const [invalidLink, setInvalidLink] = useState(() => readFilter(query) === null);
  const [linkSaved, setLinkSaved] = useState(Boolean(query));
  const [attempt, setAttempt] = useState(0);
  const [resultTab, setResultTab] = useState("matches");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadMunicipalityFilterData().then(value => { if (!cancelled) setData(value); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [attempt]);
  const conditionCount = filter.groups.reduce((sum, group) => sum + group.conditions.length, 0);
  const valid = municipalityFilterSchema.safeParse(filter).success && !invalidLink;
  const results = useMemo(() => data && valid ? data.index.municipalities.map(municipality => ({ municipality, match: evaluateMunicipalityFilter(filter, municipality, data) })) : [], [data, filter, valid]);
  const counts = { matches: results.filter(r => r.match === true).length, unknown: results.filter(r => r.match === null).length, excluded: results.filter(r => r.match === false).length };
  const mapValues = useMemo(() => Object.fromEntries(results.map(r => [r.municipality.municipalityCode, r.match])) as Record<string, Match>, [results]);
  const shown = results.filter(r => r.match === (resultTab === "matches" ? true : resultTab === "unknown" ? null : false) && `${r.municipality.name} ${r.municipality.municipalityCode} ${r.municipality.state}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  function update(value: MunicipalityFilter) { setFilter(value); setLinkSaved(false); setInvalidLink(false); }
  function updateGroup(index: number, group: MunicipalityFilter["groups"][number]) { update({ ...filter, groups: filter.groups.map((g, i) => i === index ? group : g) }); }
  function saveLink() { router.replace(`/municipalities/filter?filter=${encodeURIComponent(JSON.stringify(filter))}`, { scroll: false }); setLinkSaved(true); }
  async function openAnalysis() {
    if (creating || !valid) return;
    setCreating(true); setCreateError(false);
    try { const created = await createMunicipalityFilterAnalysis({ name: t("title"), filter }); router.push(`/municipalities/analysis?analysis=${created.id}`); }
    catch { setCreateError(true); setCreating(false); }
  }
  const municipalityUrl = (code: string) => `/municipalities/overview?municipality=${encodeURIComponent(code)}&populationYear=${filter.year}`;
  return <div className="space-y-5" data-testid="municipality-filter">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{t("title")}</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("description")}</p></div><Button variant="outline" onClick={() => update(exampleMunicipalityFilter)}>{t("example")}</Button></header>
    <div className="grid items-start gap-5 xl:grid-cols-2">
    {data && <MunicipalityFilterExplorer data={data} year={filter.year} results={mapValues} valid={valid} groups={filter.groups.map((group, index) => ({ index, available: group.conditions.length < 20 && conditionCount < 50 }))} onAdd={(index, condition) => { const group = filter.groups[index]; if (group && group.conditions.length < 20 && conditionCount < 50) updateGroup(index, { ...group, conditions: [...group.conditions, condition] }); }} />}
    <section className="min-w-0 space-y-4 rounded-xl border bg-card p-4 sm:p-5" aria-label={t("conditions")}>
      <div><h2 className="text-lg font-semibold">{t("conditions")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("conditionsHint")}</p></div>
      <div className="flex flex-wrap items-end gap-4"><label className="grid min-w-0 max-w-full gap-1 text-xs">{t("year")}<select className={selectClass} value={filter.year} onChange={e => update({ ...filter, year: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, i) => 2025 - i).map(year => <option key={year}>{year}</option>)}</select></label>{filter.groups.length > 1 && <label className="grid min-w-0 max-w-full gap-1 text-xs">{t("combineGroups")}<select className={selectClass} value={filter.mode} onChange={e => update({ ...filter, mode: e.target.value as "and" | "or" })}><option value="and">{t("and")}</option><option value="or">{t("or")}</option></select></label>}</div>
      {filter.groups.map((group, groupIndex) => <div key={groupIndex} className="space-y-4 rounded-xl border bg-muted/20 p-3 sm:p-4" data-testid="filter-group">
        <div className="flex flex-wrap items-center gap-3"><h3 className="text-sm font-medium">{t("group", { number: groupIndex + 1 })}</h3><select aria-label={t("combineConditions")} className={selectClass} value={group.mode} onChange={e => updateGroup(groupIndex, { ...group, mode: e.target.value as "and" | "or" })}><option value="and">{t("and")}</option><option value="or">{t("or")}</option></select><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={group.negate} onChange={e => updateGroup(groupIndex, { ...group, negate: e.target.checked })} />{t("negateGroup")}</label><Button variant="ghost" size="icon-sm" className="ml-auto" disabled={filter.groups.length === 1} aria-label={t("removeGroup")} onClick={() => update({ ...filter, groups: filter.groups.filter((_, i) => i !== groupIndex) })}><Trash2 /></Button></div>
        {group.conditions.map((condition, index) => <div className="flex items-start gap-3 rounded-lg border bg-background p-3" key={index} data-testid="filter-condition"><MunicipalityConditionEditor value={condition} onChange={value => updateGroup(groupIndex, { ...group, conditions: group.conditions.map((c, i) => i === index ? value : c) })} /><Button variant="ghost" size="icon-sm" className="mt-5 shrink-0 text-muted-foreground" aria-label={t("removeCondition")} disabled={group.conditions.length === 1} onClick={() => updateGroup(groupIndex, { ...group, conditions: group.conditions.filter((_, i) => i !== index) })}><Trash2 /></Button></div>)}
        <Button variant="outline" size="sm" disabled={group.conditions.length >= 20 || conditionCount >= 50} onClick={() => updateGroup(groupIndex, { ...group, conditions: [...group.conditions, defaultCondition("population")] })}><Plus />{t("addCondition")}</Button>
      </div>)}
      <div className="flex flex-wrap items-center gap-2 border-t pt-4"><Button variant="outline" disabled={filter.groups.length >= 10 || conditionCount >= 50} onClick={() => update({ ...filter, groups: [...filter.groups, { mode: "and", negate: false, conditions: [defaultCondition("providers")] }] })}><Plus />{t("addGroup")}</Button><Button variant="outline" disabled={!valid || creating} onClick={openAnalysis}>{t("openAnalysis")}</Button><Button disabled={!valid} onClick={saveLink}>{t("saveLink")}</Button><Button variant="ghost" onClick={() => update(initialMunicipalityFilter)}>{t("reset")}</Button></div>
      {createError && <p role="alert" className="text-sm text-destructive">{t("createError")}</p>}
      {linkSaved && <p role="status" className="text-sm">{t("linkSaved")}</p>}
      {!valid && <p role="alert" className="text-sm text-destructive">{t(invalidLink ? "invalidLink" : "invalid")}</p>}
      <details className="rounded-lg border p-3 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium">{t("dataNotes")}</summary><p className="mt-2 leading-5">{t("unknownHint")}</p>
      {data && <p className="text-xs leading-5 text-muted-foreground">{t("dates", { year: filter.year, date: data.digital.referenceDate, areaDate: data.index.datasetDate })}</p>}</details>
    </section>
    </div>
    {error ? <div role="alert" className="flex items-center gap-3"><p>{t("loadError")}</p><Button variant="outline" onClick={() => { setError(false); setAttempt(a => a + 1); }}>{t("retry")}</Button></div> : !data ? <p role="status">{t("loading")}</p> : valid && <section className="space-y-4" aria-label={t("results")}>
      <h2 className="text-lg font-semibold" aria-live="polite">{t("resultCount", { count: counts.matches })}</h2>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2"><label className="grid min-w-0 max-w-full gap-1 text-xs">{t("resultStatus")}<select className={selectClass} value={resultTab} onChange={e => setResultTab(e.target.value)}>{(["matches", "unknown", "excluded"] as const).map(status => <option key={status} value={status}>{t(status)} ({counts[status]})</option>)}</select></label><label className="grid min-w-0 max-w-full gap-1 text-xs">{t("search")}<input className={selectClass} value={search} onChange={e => setSearch(e.target.value)} /></label></div>
        <div className="max-h-[36rem] overflow-auto rounded-lg border"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="p-3">{t("municipality")}</th><th className="p-3">{t("fields.state")}</th><th className="p-3 text-right">{t("fields.population")}</th></tr></thead><tbody>{shown.map(({ municipality }) => <tr className="border-t" key={municipality.municipalityCode}><td className="p-3"><Link className="font-medium underline underline-offset-4" href={municipalityUrl(municipality.municipalityCode)}>{municipality.name}</Link><span className="ml-2 text-xs text-muted-foreground">{municipality.municipalityCode}</span></td><td className="p-3">{municipality.state}</td><td className="p-3 text-right tabular-nums">{data.population.years[String(filter.year)]?.values[municipality.municipalityCode] === undefined ? "—" : format.number(data.population.years[String(filter.year)].values[municipality.municipalityCode])}</td></tr>)}</tbody></table>{!shown.length && <p className="p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>}</div>
      </div>
    </section>}
  </div>;
}
