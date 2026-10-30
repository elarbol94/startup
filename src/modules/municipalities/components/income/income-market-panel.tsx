"use client";

// The income market analysis under the map, shown while the Kostenübersicht is on an income
// view. Works from the series the map already loaded and follows the map's year.
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Database, RotateCcw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { median } from "../../costs";
import { normalizeMunicipalitySearch, type MunicipalityIndex } from "../../data";
import { digitalPlatformProviderClassification, type MunicipalityDigitalPlatformDataset } from "../../digital-platforms";
import {
  buildIncomeMarketEntries, municipalityIncomeYears, populationClassIndex, quantileBreaks, summarizeIncomeSegment, tierFor,
  type IncomeMarketEntry, type MunicipalityIncomeSeries,
} from "../../income";
import { POPULATION_CLASSES, type MunicipalityPopulationSeries } from "../../population";
import { AnalysisSeriesChart } from "../analysis-series-chart";
import { IncomeRankingTable } from "./income-ranking-table";
import { IncomeSegmentTable, type IncomeSegment } from "./income-segment-table";
import {
  CompositionBar, Filter, SELECT_CLASS, StatGrid, formatOrDash, populationClassLabel, useIncomeFormats, useProviderLabel,
} from "./income-shared";

type AppFilter = "all" | "with-app" | "without-app" | "unknown";
const TIERS = 5;

const appStatus = (entry: IncomeMarketEntry): Exclude<AppFilter, "all"> =>
  entry.provider === null ? "unknown" : entry.provider === "none" ? "without-app" : "with-app";

function groupBy<Key>(entries: IncomeMarketEntry[], key: (entry: IncomeMarketEntry) => Key) {
  const groups = new Map<Key, IncomeMarketEntry[]>();
  for (const entry of entries) {
    const id = key(entry);
    const group = groups.get(id);
    if (group) group.push(entry); else groups.set(id, [entry]);
  }
  return groups;
}

function buildMarket(series: MunicipalityIncomeSeries, population: MunicipalityPopulationSeries, index: MunicipalityIndex, digital: MunicipalityDigitalPlatformDataset | null, year: number) {
  const providers = new Map(Object.entries(digital?.municipalities ?? {}).map(([code, profile]) => [
    code, digitalPlatformProviderClassification(profile)?.category ?? null,
  ]));
  const years = municipalityIncomeYears().filter((item) => (series.years[String(item)]?.coverage ?? 0) > 0);
  const categoryTrend = years.map((trendYear) => {
    const categories = buildIncomeMarketEntries({ series, population, municipalities: index.municipalities, providerFor: () => null, year: trendYear });
    return {
      year: trendYear,
      categories: categories.reduce((sums, entry) => sums.map((sum, position) => sum + entry.categories[position]), categories[0]?.categories.map(() => 0) ?? []),
      population: categories.reduce((sum, entry) => sum + entry.population, 0),
    };
  });
  // Population of every Gemeinde, covered or not, so a state's total can be estimated.
  const allPopulation = { byState: {} as Record<string, number>, count: { byState: {} as Record<string, number>, byClass: [] as number[] } };
  for (const { municipalityCode, state } of index.municipalities) {
    const inhabitants = population.years[String(year)]?.values[municipalityCode] ?? 0;
    const band = populationClassIndex(inhabitants);
    allPopulation.byState[state] = (allPopulation.byState[state] ?? 0) + inhabitants;
    allPopulation.count.byState[state] = (allPopulation.count.byState[state] ?? 0) + 1;
    allPopulation.count.byClass[band] = (allPopulation.count.byClass[band] ?? 0) + 1;
  }
  return {
    year,
    entries: buildIncomeMarketEntries({ series, population, municipalities: index.municipalities, providerFor: (code) => providers.get(code) ?? null, year }),
    categoryTrend,
    allPopulation,
    coverage: series.years[String(year)]?.coverage ?? 0,
    municipalityCount: index.municipalities.length,
    source: series.source,
  };
}

export function IncomeMarketPanel({ series, population, index, digital, year, onSelect }: {
  series: MunicipalityIncomeSeries;
  population: MunicipalityPopulationSeries;
  index: MunicipalityIndex;
  digital: MunicipalityDigitalPlatformDataset | null;
  year: number;
  onSelect: (code: string) => void;
}) {
  const t = useTranslations("municipalityIncome");
  const formats = useIncomeFormats();
  const providerLabel = useProviderLabel();
  const [state, setState] = useState("all");
  const [populationClass, setPopulationClass] = useState("all");
  const [app, setApp] = useState<AppFilter>("all");
  const [query, setQuery] = useState("");
  const market = useMemo(() => buildMarket(series, population, index, digital, year), [digital, index, population, series, year]);
  const states = Object.keys(market.allPopulation.byState).sort((left, right) => left.localeCompare(right, formats.locale));

  const normalizedQuery = normalizeMunicipalitySearch(query);
  const matches = (entry: IncomeMarketEntry, omit?: "state" | "class" | "app") =>
    (omit === "state" || state === "all" || entry.state === state)
    && (omit === "class" || populationClass === "all" || entry.populationClass === Number(populationClass))
    && (omit === "app" || app === "all" || appStatus(entry) === app)
    && (!normalizedQuery || normalizeMunicipalitySearch(`${entry.name} ${entry.code}`).includes(normalizedQuery));
  const filtered = market.entries.filter((entry) => matches(entry));
  const summary = summarizeIncomeSegment(filtered);
  const categories = filtered.reduce((sums, entry) => sums.map((sum, index) => sum + entry.categories[index]), market.entries[0]?.categories.map(() => 0) ?? []);
  const groupLabel = (id: string) => t(`group.${id}`);

  const stateGroups = groupBy(market.entries.filter((item) => matches(item, "state")), (entry) => entry.state);
  const classGroups = groupBy(market.entries.filter((item) => matches(item, "class")), (entry) => entry.populationClass);
  const stateSegments: IncomeSegment[] = states.map((id) => {
    const rows = stateGroups.get(id) ?? [];
    const segment = summarizeIncomeSegment(rows);
    // Only an unfiltered state stands for the whole state; otherwise the multiplication would extrapolate a subset.
    const unfiltered = populationClass === "all" && app === "all" && !normalizedQuery;
    const estimate = unfiltered && segment.totalPerCapita !== null ? segment.totalPerCapita * market.allPopulation.byState[id] : null;
    return { id, label: id, summary: segment, extra: `${formats.integer.format(segment.count)}/${formats.integer.format(market.allPopulation.count.byState[id])} · ${formatOrDash(formats.compactCurrency, estimate)}` };
  });
  const classSegments: IncomeSegment[] = POPULATION_CLASSES.map((_, index) => {
    const rows = classGroups.get(index) ?? [];
    return { id: String(index), label: populationClassLabel(index, formats.integer), summary: summarizeIncomeSegment(rows), extra: `${formats.integer.format(rows.length)}/${formats.integer.format(market.allPopulation.count.byClass[index] ?? 0)}` };
  });
  const appGroups = groupBy(market.entries.filter((item) => matches(item, "app")), appStatus);
  const appSegments: IncomeSegment[] = (["with-app", "without-app", "unknown"] as const).map((id) => {
    const rows = appGroups.get(id) ?? [];
    const providers = new Map<string, number>();
    for (const row of rows) if (row.provider && row.provider !== "none") providers.set(providerLabel(row.provider), (providers.get(providerLabel(row.provider)) ?? 0) + 1);
    const leading = [...providers].sort((left, right) => right[1] - left[1]).slice(0, 2).map(([name, count]) => `${name} ${count}`).join(", ");
    return { id, label: t(`app.${id}`), summary: summarizeIncomeSegment(rows), extra: leading || undefined };
  });
  // Tiers by Finanzkraft per head across the filtered set: who can afford what.
  const capacities = filtered.flatMap(({ facts }) => facts.fiscalCapacityPerCapita === null ? [] : [facts.fiscalCapacityPerCapita]);
  const breaks = capacities.length >= TIERS ? quantileBreaks(capacities, TIERS) : [];
  const tierSegments: IncomeSegment[] = breaks.length ? Array.from({ length: TIERS }, (_, tier) => {
    const rows = filtered.filter(({ facts }) => facts.fiscalCapacityPerCapita !== null && tierFor(facts.fiscalCapacityPerCapita, breaks) === tier);
    const known = rows.filter((row) => row.provider !== null);
    const lower = tier === 0 ? null : breaks[tier - 1];
    const upper = tier === TIERS - 1 ? null : breaks[tier];
    const range = lower === null ? `< ${formats.currency.format(upper!)}` : upper === null ? `≥ ${formats.currency.format(lower)}` : `${formats.currency.format(lower)}–${formats.currency.format(upper)}`;
    return { id: String(tier), label: `${t("tier", { tier: tier + 1 })} · ${range}`, summary: summarizeIncomeSegment(rows), extra: known.length ? formats.percent.format(known.filter((row) => row.provider !== "none").length / known.length) : undefined };
  }) : [];

  const nationalTrend = {
    unit: "currency-per-person", valueType: "number" as const, error: null, warnings: [],
    points: market.categoryTrend.map(({ year, categories: values, population }) => ({ year, value: population > 0 ? values.reduce((sum, value) => sum + value, 0) / population : null })),
  };
  const first = market.categoryTrend[0];
  const latest = market.categoryTrend.at(-1)!;

  function resetFilters() { setState("all"); setPopulationClass("all"); setApp("all"); setQuery(""); }

  return (
    <section className="col-span-full mt-4 space-y-4 pb-8" aria-labelledby="income-market-title" data-testid="income-market-panel">
      <header className="flex flex-col gap-4 rounded-xl border bg-card px-[18px] py-4 shadow-card md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-brand-ink uppercase">{t("eyebrow")}</p>
          <h2 id="income-market-title" className="mt-1 text-[22px] leading-tight font-semibold tracking-[-0.02em]">{t("marketTitle")}</h2>
          <p className="mt-1 max-w-3xl text-[13.5px] text-muted-foreground">{t("marketDescription")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="outline">{t("yearNote", { year: market.year })}</Badge>
            <Badge variant="outline">{t("coverage", { covered: market.coverage, total: market.municipalityCount })}</Badge>
            <Badge variant="outline"><Database className="size-3" />{market.source.title}</Badge>
          </div>
        </div>
      </header>

      <Card className="shadow-card">
        <CardContent className="grid gap-3 pt-1 sm:grid-cols-2 xl:grid-cols-4">
          <Filter label={t("state")}><select className={SELECT_CLASS} value={state} onChange={(event) => setState(event.target.value)}>
            <option value="all">{t("allStates")}</option>{states.map((item) => <option key={item} value={item}>{item}</option>)}
          </select></Filter>
          <Filter label={t("populationClass")}><select className={SELECT_CLASS} value={populationClass} onChange={(event) => setPopulationClass(event.target.value)}>
            <option value="all">{t("allPopulationClasses")}</option>{POPULATION_CLASSES.map((_, index) => <option key={index} value={index}>{populationClassLabel(index, formats.integer)}</option>)}
          </select></Filter>
          <Filter label={t("appStatus")}><select className={SELECT_CLASS} value={app} onChange={(event) => setApp(event.target.value as AppFilter)}>
            {(["all", "with-app", "without-app", "unknown"] as const).map((id) => <option key={id} value={id}>{t(`app.${id}`)}</option>)}
          </select></Filter>
          <Filter label={t("search")}><div className="relative"><Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input className="pl-9" type="search" value={query} onValueChange={setQuery} placeholder={t("searchPlaceholder")} /></div></Filter>
        </CardContent>
        <div className="flex min-h-12 flex-wrap items-center gap-2 border-t border-line-soft px-6 py-3">
          <span className="text-xs text-muted-foreground">{t("filterResult", { count: summary.count, population: formats.integer.format(summary.population) })}</span>
          <Button className="ml-auto" variant="ghost" size="sm" onClick={resetFilters}><RotateCcw className="size-4" />{t("resetFilters")}</Button>
        </div>
      </Card>

      <StatGrid label={t("summary")} items={[
        { label: t("totalIncome"), value: formats.compactCurrency.format(summary.total), note: t("yearNote", { year: market.year }) },
        { label: t("medianPerCapita"), value: formatOrDash(formats.currency, summary.medianTotalPerCapita), note: t("weightedPerCapita", { value: formatOrDash(formats.currency, summary.totalPerCapita) }) },
        { label: t("medianFiscalCapacity"), value: formatOrDash(formats.currency, summary.medianFiscalCapacityPerCapita), note: t("fiscalCapacityNote") },
        { label: t("negativeFreeBalance"), value: summary.count ? formats.percent.format(summary.negativeFreeBalance / summary.count) : "—", note: t("negativeFreeBalanceNote", { count: summary.negativeFreeBalance }) },
        { label: t("fiscalCapacityTotal"), value: formats.compactCurrency.format(summary.fiscalCapacity) },
        { label: t("freeBalanceTotal"), value: formats.compactCurrency.format(summary.freeBalance), note: t("freeBalanceNote") },
        { label: t("medianOwnShare"), value: formatOrDash(formats.percent, summary.medianOwnShare) },
        { label: t("medianGrowth"), value: formatOrDash(formats.signedPercent, median(filtered.flatMap(({ growth }) => growth === null ? [] : [growth]))), note: t("growthNote", { from: market.year - 5, to: market.year }) },
      ]} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="shadow-card">
          <CardHeader><CardTitle>{t("compositionTitle")}</CardTitle><CardDescription>{t("compositionDescription", { year: market.year })}</CardDescription></CardHeader>
          <CardContent><CompositionBar categories={categories} groupLabel={groupLabel} formats={formats} label={t("compositionTitle")} /></CardContent>
        </Card>
        <Card className="shadow-card">
          <CardHeader><CardTitle>{t("trendTitle")}</CardTitle><CardDescription>{t("trendDescription")}</CardDescription></CardHeader>
          <CardContent className="grid gap-4">
            <AnalysisSeriesChart series={nationalTrend} label={t("trendTitle")} trueLabel="" falseLabel="" />
            <CompositionBar categories={first.categories} groupLabel={(id) => `${groupLabel(id)} ${first.year}`} formats={formats} label={String(first.year)} />
            <CompositionBar categories={latest.categories} groupLabel={(id) => `${groupLabel(id)} ${latest.year}`} formats={formats} label={String(latest.year)} />
          </CardContent>
        </Card>
      </div>

      <IncomeSegmentTable title={t("byState")} description={t("byStateDescription")} segments={stateSegments} formats={formats} extraLabel={t("coverageAndEstimate")} onSelect={(id) => setState(state === id ? "all" : id)} selected={state} />
      <IncomeSegmentTable title={t("byPopulationClass")} description={t("byPopulationClassDescription")} segments={classSegments} formats={formats} extraLabel={t("coverageShort")} onSelect={(id) => setPopulationClass(populationClass === id ? "all" : id)} selected={populationClass} />
      <IncomeSegmentTable title={t("byApp")} description={t("byAppDescription")} segments={appSegments} formats={formats} extraLabel={t("leadingProviders")} onSelect={(id) => setApp(app === id ? "all" : id as AppFilter)} selected={app} />
      {tierSegments.length ? <IncomeSegmentTable title={t("byTier")} description={t("byTierDescription")} segments={tierSegments} formats={formats} extraLabel={t("appAdoption")} /> : null}
      <IncomeRankingTable entries={filtered} formats={formats} year={market.year} onSelect={onSelect} />

      <p className="text-xs text-muted-foreground">{t("methodology")}</p>
    </section>
  );
}
