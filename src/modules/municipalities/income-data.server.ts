import "server-only";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { median } from "./costs";
import { validateMunicipalityIndex, type MunicipalityIndex, type MunicipalityIndexItem } from "./data";
import {
  digitalPlatformProviderClassification,
  validateMunicipalityDigitalPlatformDataset,
  type DigitalPlatformProviderCategory,
  type MunicipalityDigitalPlatformDataset,
} from "./digital-platforms";
import {
  INCOME_CATEGORY_IDS,
  MUNICIPALITY_INCOME_FILE,
  compoundAnnualGrowth,
  incomeCategoryCents,
  municipalityIncomeFacts,
  municipalityIncomeYears,
  percentileRank,
  populationClassIndex,
  validateMunicipalityIncomeSeries,
  type IncomeCategoryId,
  type MunicipalityIncomeFacts,
  type MunicipalityIncomeSeries,
} from "./income";
import { validateMunicipalityPopulationSeries, type MunicipalityPopulationSeries } from "./population";

const DATA_DIRECTORY = resolve("public/data");
const GROWTH_SPAN = 5;

async function readJson<T>(name: string) {
  return JSON.parse(await readFile(resolve(DATA_DIRECTORY, name), "utf8")) as T;
}

type IncomeContext = {
  series: MunicipalityIncomeSeries;
  population: MunicipalityPopulationSeries;
  municipalities: Map<string, MunicipalityIndexItem>;
  providers: Map<string, DigitalPlatformProviderCategory | null>;
};

// The income file is generated from the raw Rechnungsabschlüsse and copied onto the
// server, never committed; without it the pages explain how to create it.
let context: Promise<IncomeContext | null> | null = null;

async function readContext(): Promise<IncomeContext | null> {
  let raw: MunicipalityIncomeSeries;
  try {
    raw = await readJson<MunicipalityIncomeSeries>(MUNICIPALITY_INCOME_FILE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const index = validateMunicipalityIndex(await readJson<MunicipalityIndex>("municipalities-at-2026.index.json"));
  const codes = index.municipalities.map(({ municipalityCode }) => municipalityCode);
  const population = validateMunicipalityPopulationSeries(await readJson<MunicipalityPopulationSeries>("municipality-population-2002-2025.json"), codes);
  const platforms = validateMunicipalityDigitalPlatformDataset(await readJson<MunicipalityDigitalPlatformDataset>("municipality-digital-platforms.json"), codes);
  return {
    series: validateMunicipalityIncomeSeries(raw, codes),
    population,
    municipalities: new Map(index.municipalities.map((item) => [item.municipalityCode, item])),
    providers: new Map(Object.entries(platforms.municipalities).map(([code, profile]) => [
      code, digitalPlatformProviderClassification(profile)?.category ?? null,
    ])),
  };
}

function loadContext() {
  context ??= readContext().catch((error: unknown) => { context = null; throw error; });
  return context;
}

function populationAt(context: IncomeContext, code: string, year: number) {
  return context.population.years[String(year)]?.values[code];
}

function factsAt(context: IncomeContext, code: string, year: number) {
  const value = context.series.years[String(year)]?.values[code];
  return value ? municipalityIncomeFacts(value, populationAt(context, code, year)) : null;
}

export type IncomeMarketEntry = {
  code: string;
  name: string;
  state: string;
  population: number;
  populationClass: number;
  provider: DigitalPlatformProviderCategory | null;
  facts: MunicipalityIncomeFacts;
  categories: number[];
  /** Annual growth of income per head over the last five years, when both ends exist. */
  growth: number | null;
};

export type IncomeMarket = {
  year: number;
  years: number[];
  coverage: Record<string, number>;
  municipalityCount: number;
  source: MunicipalityIncomeSeries["source"];
  generatedAt: string;
  entries: IncomeMarketEntry[];
  /** Sum of every covered Gemeinde's income per category and year, euro. */
  categoryTrend: Array<{ year: number; categories: number[]; population: number }>;
  /** Population of all Gemeinden, covered or not, so segments can be extrapolated. */
  allPopulation: { byState: Record<string, number>; byClass: number[]; count: { byState: Record<string, number>; byClass: number[] } };
};

export async function loadMunicipalityIncomeMarket(requestedYear?: number): Promise<IncomeMarket | null> {
  const loaded = await loadContext();
  if (!loaded) return null;
  const years = municipalityIncomeYears().filter((year) => loaded.series.years[String(year)].coverage > 0);
  const year = requestedYear && years.includes(requestedYear) ? requestedYear : years.at(-1)!;
  const entries = Object.entries(loaded.series.years[String(year)].values).flatMap(([code, value]) => {
    const municipality = loaded.municipalities.get(code);
    const population = populationAt(loaded, code, year);
    if (!municipality || !population) return [];
    const facts = municipalityIncomeFacts(value, population);
    const past = factsAt(loaded, code, year - GROWTH_SPAN);
    return [{
      code,
      name: municipality.name,
      state: municipality.state,
      population,
      populationClass: populationClassIndex(population),
      provider: loaded.providers.get(code) ?? null,
      facts,
      categories: INCOME_CATEGORY_IDS.map((category) => incomeCategoryCents(value, category) / 100),
      growth: compoundAnnualGrowth(past?.totalPerCapita, facts.totalPerCapita, GROWTH_SPAN),
    } satisfies IncomeMarketEntry];
  });
  const categoryTrend = years.map((trendYear) => {
    const categories = INCOME_CATEGORY_IDS.map(() => 0);
    let population = 0;
    for (const [code, value] of Object.entries(loaded.series.years[String(trendYear)].values)) {
      INCOME_CATEGORY_IDS.forEach((category, index) => { categories[index] += incomeCategoryCents(value, category) / 100; });
      population += populationAt(loaded, code, trendYear) ?? 0;
    }
    return { year: trendYear, categories, population };
  });
  const allPopulation: IncomeMarket["allPopulation"] = { byState: {}, byClass: [], count: { byState: {}, byClass: [] } };
  for (const [code, municipality] of loaded.municipalities) {
    const population = populationAt(loaded, code, year) ?? 0;
    const band = populationClassIndex(population);
    allPopulation.byState[municipality.state] = (allPopulation.byState[municipality.state] ?? 0) + population;
    allPopulation.byClass[band] = (allPopulation.byClass[band] ?? 0) + population;
    allPopulation.count.byState[municipality.state] = (allPopulation.count.byState[municipality.state] ?? 0) + 1;
    allPopulation.count.byClass[band] = (allPopulation.count.byClass[band] ?? 0) + 1;
  }
  return {
    year,
    years,
    allPopulation,
    coverage: Object.fromEntries(years.map((item) => [item, loaded.series.years[String(item)].coverage])),
    municipalityCount: loaded.municipalities.size,
    source: loaded.series.source,
    generatedAt: loaded.series.generatedAt,
    entries,
    categoryTrend,
  };
}

export type MunicipalityIncomeProfile = {
  municipality: { code: string; name: string; state: string };
  provider: DigitalPlatformProviderCategory | null;
  source: MunicipalityIncomeSeries["source"];
  years: Array<{
    year: number;
    population: number | null;
    facts: MunicipalityIncomeFacts;
    categories: number[];
    /** Median of the same population class nationwide, so the line has a reference. */
    peerMedianPerCapita: number | null;
  }>;
  /** Latest year: rank among all Gemeinden of the same population class (0–1). */
  peerRanks: Record<"totalPerCapita" | "fiscalCapacityPerCapita" | "freeBalancePerCapita" | "ownShare", number | null>;
  peerCount: number;
  categoryPeerMedians: Record<IncomeCategoryId, number | null>;
};

export async function loadMunicipalityIncomeProfile(code: string): Promise<MunicipalityIncomeProfile | null> {
  if (!/^\d{5}$/.test(code)) return null;
  const loaded = await loadContext();
  const municipality = loaded?.municipalities.get(code);
  if (!loaded || !municipality) return null;
  const years = municipalityIncomeYears().filter((year) => loaded.series.years[String(year)].values[code]);
  if (!years.length) return null;
  const peersOf = (year: number) => {
    const population = populationAt(loaded, code, year);
    if (!population) return [];
    const band = populationClassIndex(population);
    return Object.keys(loaded.series.years[String(year)].values).flatMap((peer) => {
      const peerPopulation = populationAt(loaded, peer, year);
      return peerPopulation && populationClassIndex(peerPopulation) === band ? [factsAt(loaded, peer, year)!] : [];
    });
  };
  const latest = years.at(-1)!;
  const latestFacts = factsAt(loaded, code, latest)!;
  const latestPeers = peersOf(latest);
  const rank = (pick: (facts: MunicipalityIncomeFacts) => number | null) => {
    const value = pick(latestFacts);
    const values = latestPeers.flatMap((facts) => { const item = pick(facts); return item === null ? [] : [item]; });
    return value === null ? null : percentileRank(values, value);
  };
  const latestPopulation = populationAt(loaded, code, latest);
  const latestPeerCodes = Object.keys(loaded.series.years[String(latest)].values).filter((peer) => {
    const peerPopulation = populationAt(loaded, peer, latest);
    return latestPopulation && peerPopulation && populationClassIndex(peerPopulation) === populationClassIndex(latestPopulation);
  });
  return {
    municipality: { code, name: municipality.name, state: municipality.state },
    provider: loaded.providers.get(code) ?? null,
    source: loaded.series.source,
    years: years.map((year) => {
      const value = loaded.series.years[String(year)].values[code];
      const population = populationAt(loaded, code, year) ?? null;
      return {
        year,
        population,
        facts: municipalityIncomeFacts(value, population ?? undefined),
        categories: INCOME_CATEGORY_IDS.map((category) => incomeCategoryCents(value, category) / 100),
        peerMedianPerCapita: median(peersOf(year).flatMap(({ totalPerCapita }) => totalPerCapita === null ? [] : [totalPerCapita])),
      };
    }),
    peerRanks: {
      totalPerCapita: rank(({ totalPerCapita }) => totalPerCapita),
      fiscalCapacityPerCapita: rank(({ fiscalCapacityPerCapita }) => fiscalCapacityPerCapita),
      freeBalancePerCapita: rank(({ freeBalancePerCapita }) => freeBalancePerCapita),
      ownShare: rank(({ ownShare }) => ownShare),
    },
    peerCount: latestPeers.length,
    categoryPeerMedians: Object.fromEntries(INCOME_CATEGORY_IDS.map((category) => [category, median(latestPeerCodes.flatMap((peer) => {
      const population = populationAt(loaded, peer, latest)!;
      return [incomeCategoryCents(loaded.series.years[String(latest)].values[peer], category) / 100 / population];
    }))])) as Record<IncomeCategoryId, number | null>,
  };
}

/** Codes with at least one income year, for the overview's link to the profile page. */
export async function municipalityIncomeCodes() {
  const loaded = await loadContext();
  if (!loaded) return [];
  return [...new Set(Object.values(loaded.series.years).flatMap(({ values }) => Object.keys(values)))];
}
