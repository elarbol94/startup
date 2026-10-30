import { median } from "./costs";
import { POPULATION_CLASSES } from "./population";

export const MUNICIPALITY_INCOME_SCHEMA_VERSION = 1;
export const MUNICIPALITY_INCOME_FIRST_YEAR = 2010;
export const MUNICIPALITY_INCOME_LATEST_YEAR = 2024;
export const MUNICIPALITY_INCOME_FILE = "municipality-income-2010-2024.json";

/**
 * Einzahlungen of the Finanzierungshaushalt (VRV 2015; Statistik Austria maps the
 * VRV 1997 years onto the same MVAG codes). `group` decides which Saldo a category
 * belongs to: operative (MVAG 31) or investive (MVAG 33). Financing inflows (MVAG 35:
 * loans) are not income and are kept outside the tuple's total.
 */
export const INCOME_CATEGORIES = [
  { id: "communalTax", group: "operating", own: true },
  { id: "propertyTax", group: "operating", own: true },
  { id: "otherOwnTaxes", group: "operating", own: true },
  { id: "sharedTaxes", group: "operating", own: false },
  { id: "fees", group: "operating", own: true },
  { id: "services", group: "operating", own: true },
  { id: "property", group: "operating", own: true },
  { id: "otherOperating", group: "operating", own: true },
  { id: "transfersFederal", group: "operating", own: false },
  { id: "transfersState", group: "operating", own: false },
  { id: "transfersOther", group: "operating", own: false },
  { id: "financialIncome", group: "operating", own: true },
  { id: "investive", group: "investive", own: false },
] as const;

export type IncomeCategoryId = (typeof INCOME_CATEGORIES)[number]["id"];
export const INCOME_CATEGORY_IDS = INCOME_CATEGORIES.map(({ id }) => id);
const CATEGORY_COUNT = INCOME_CATEGORIES.length;

/**
 * [total, …13 categories, financingInflow, operatingOutflow, financingOutflow], cents.
 * The three trailing values make Saldo 1 and the freie Finanzspitze computable without
 * a second file: Saldo 1 = MVAG 31 − 32, freie Finanzspitze = Saldo 1 − MVAG 36.
 */
export type MunicipalityIncomeTuple = number[];
const FINANCING_INFLOW = CATEGORY_COUNT + 1;
const OPERATING_OUTFLOW = CATEGORY_COUNT + 2;
const FINANCING_OUTFLOW = CATEGORY_COUNT + 3;
export const INCOME_TUPLE_LENGTH = CATEGORY_COUNT + 4;

export type MunicipalityIncomeSeries = {
  schemaVersion: typeof MUNICIPALITY_INCOME_SCHEMA_VERSION;
  firstYear: typeof MUNICIPALITY_INCOME_FIRST_YEAR;
  latestYear: typeof MUNICIPALITY_INCOME_LATEST_YEAR;
  unit: "cents";
  categories: readonly IncomeCategoryId[];
  generatedAt: string;
  source: { title: string; url: string; origin: "Statistik Austria" };
  years: Record<string, { coverage: number; values: Record<string, MunicipalityIncomeTuple> }>;
};

/** Which category a Finanzierungshaushalt row counts towards, or null when it is no income. */
export function incomeCategoryForRow(mvag: string, accountGroup: string): IncomeCategoryId | null {
  const account = accountGroup.padStart(3, "0");
  if (mvag.startsWith("3111")) {
    if (account === "833") return "communalTax";
    if (account === "830" || account === "831" || account === "832") return "propertyTax";
    return "otherOwnTaxes";
  }
  if (mvag.startsWith("3112")) return "sharedTaxes";
  if (mvag.startsWith("3113")) return "fees";
  if (mvag.startsWith("3114")) return "services";
  if (mvag.startsWith("3115")) return "property";
  if (mvag.startsWith("311")) return "otherOperating";
  if (mvag.startsWith("312")) {
    if (account === "860") return "transfersFederal";
    if (account === "861") return "transfersState";
    return "transfersOther";
  }
  if (mvag.startsWith("313")) return "financialIncome";
  if (mvag.startsWith("33")) return "investive";
  return null;
}

export function municipalityIncomeYears() {
  return Array.from(
    { length: MUNICIPALITY_INCOME_LATEST_YEAR - MUNICIPALITY_INCOME_FIRST_YEAR + 1 },
    (_, index) => MUNICIPALITY_INCOME_FIRST_YEAR + index,
  );
}

export function isIncomeCategoryId(value: string): value is IncomeCategoryId {
  return (INCOME_CATEGORY_IDS as readonly string[]).includes(value);
}

export function incomeCategoryCents(value: MunicipalityIncomeTuple, category: IncomeCategoryId | "total") {
  return category === "total" ? value[0] : value[INCOME_CATEGORY_IDS.indexOf(category) + 1];
}

const sumCategories = (value: MunicipalityIncomeTuple, include: (category: (typeof INCOME_CATEGORIES)[number]) => boolean) =>
  INCOME_CATEGORIES.reduce((sum, category, index) => include(category) ? sum + value[index + 1] : sum, 0);

/** The figures a market analysis reads off one Rechnungsabschluss, all in euro. */
export function municipalityIncomeFacts(value: MunicipalityIncomeTuple, population: number | undefined) {
  const operating = sumCategories(value, ({ group }) => group === "operating");
  const own = sumCategories(value, ({ own }) => own);
  // Finanzkraft as the Länder define it for Bedarfszuweisungen: Kommunalsteuer + Grundsteuer + Ertragsanteile.
  const fiscalCapacity = value[1] + value[2] + value[4];
  const transfers = value[9] + value[10] + value[11];
  const operatingBalance = operating - value[OPERATING_OUTFLOW];
  const freeBalance = operatingBalance - value[FINANCING_OUTFLOW];
  const perCapita = (cents: number) => population && population > 0 ? cents / 100 / population : null;
  return {
    total: value[0] / 100,
    operating: operating / 100,
    own: own / 100,
    fiscalCapacity: fiscalCapacity / 100,
    transfers: transfers / 100,
    loans: value[FINANCING_INFLOW] / 100,
    operatingBalance: operatingBalance / 100,
    freeBalance: freeBalance / 100,
    totalPerCapita: perCapita(value[0]),
    fiscalCapacityPerCapita: perCapita(fiscalCapacity),
    freeBalancePerCapita: perCapita(freeBalance),
    ownShare: value[0] > 0 ? own / value[0] : null,
    transferShare: value[0] > 0 ? transfers / value[0] : null,
    // Share of operative income left after running costs: the KDZ "Saldo-1-Quote".
    operatingMargin: operating > 0 ? operatingBalance / operating : null,
    freeBalanceMargin: operating > 0 ? freeBalance / operating : null,
  };
}

export type MunicipalityIncomeFacts = ReturnType<typeof municipalityIncomeFacts>;

/** Compound annual growth rate; null when either end is missing or not positive. */
export function compoundAnnualGrowth(first: number | null | undefined, last: number | null | undefined, years: number) {
  if (!first || !last || first <= 0 || last <= 0 || years <= 0) return null;
  return (last / first) ** (1 / years) - 1;
}

/** Share of values strictly below `value` plus half of the ties, so the median sits at 0.5. */
export function percentileRank(values: number[], value: number) {
  if (!values.length) return null;
  let below = 0;
  let equal = 0;
  for (const item of values) {
    if (item < value) below += 1;
    else if (item === value) equal += 1;
  }
  return (below + equal / 2) / values.length;
}

export function populationClassIndex(population: number) {
  const index = POPULATION_CLASSES.findIndex(({ maximum }) => maximum === null || population <= maximum);
  return index < 0 ? POPULATION_CLASSES.length - 1 : index;
}

/** Quantile boundaries (exclusive upper) used to split the market into equal-sized tiers. */
export function quantileBreaks(values: number[], tiers: number) {
  const sorted = values.toSorted((left, right) => left - right);
  return Array.from({ length: tiers - 1 }, (_, index) => sorted[Math.floor(((index + 1) * sorted.length) / tiers)]);
}

export function tierFor(value: number, breaks: number[]) {
  const index = breaks.findIndex((limit) => value < limit);
  return index < 0 ? breaks.length : index;
}

export type IncomeMarketRow = {
  code: string;
  population: number;
  facts: MunicipalityIncomeFacts;
};

/** Sums and medians for one market segment; per-capita figures weight by people, medians by Gemeinde. */
export function summarizeIncomeSegment(rows: IncomeMarketRow[]) {
  const population = rows.reduce((sum, row) => sum + row.population, 0);
  const sum = (pick: (facts: MunicipalityIncomeFacts) => number) => rows.reduce((total, row) => total + pick(row.facts), 0);
  const total = sum(({ total }) => total);
  const freeBalance = sum(({ freeBalance }) => freeBalance);
  const values = (pick: (facts: MunicipalityIncomeFacts) => number | null) =>
    rows.flatMap(({ facts }) => { const value = pick(facts); return value === null ? [] : [value]; });
  return {
    count: rows.length,
    population,
    total,
    fiscalCapacity: sum(({ fiscalCapacity }) => fiscalCapacity),
    freeBalance,
    totalPerCapita: population > 0 ? total / population : null,
    medianTotalPerCapita: median(values(({ totalPerCapita }) => totalPerCapita)),
    medianFiscalCapacityPerCapita: median(values(({ fiscalCapacityPerCapita }) => fiscalCapacityPerCapita)),
    medianOwnShare: median(values(({ ownShare }) => ownShare)),
    medianOperatingMargin: median(values(({ operatingMargin }) => operatingMargin)),
    negativeFreeBalance: rows.filter(({ facts }) => facts.freeBalance < 0).length,
  };
}

export type IncomeSegmentSummary = ReturnType<typeof summarizeIncomeSegment>;

function isValidIncomeTuple(value: unknown): value is MunicipalityIncomeTuple {
  return Array.isArray(value)
    && value.length === INCOME_TUPLE_LENGTH
    && value.every(Number.isSafeInteger)
    && value[0] > 0
    && value.slice(1, CATEGORY_COUNT + 1).reduce((sum, item) => sum + item, 0) === value[0];
}

export function validateMunicipalityIncomeSeries(series: MunicipalityIncomeSeries, municipalityCodes: Iterable<string>) {
  if (
    series.schemaVersion !== MUNICIPALITY_INCOME_SCHEMA_VERSION
    || series.firstYear !== MUNICIPALITY_INCOME_FIRST_YEAR
    || series.latestYear !== MUNICIPALITY_INCOME_LATEST_YEAR
    || series.unit !== "cents"
    || series.categories.join("|") !== INCOME_CATEGORY_IDS.join("|")
  ) throw new Error("Unerwartete Version oder Gliederung der Einnahmenübersicht.");
  const knownCodes = new Set(municipalityCodes);
  if (Object.keys(series.years).length !== municipalityIncomeYears().length) {
    throw new Error("Unvollständiger Zeitraum der Einnahmenübersicht.");
  }
  for (const year of municipalityIncomeYears()) {
    const snapshot = series.years[String(year)];
    if (!snapshot) throw new Error(`Fehlende Einnahmenübersicht für ${year}.`);
    const entries = Object.entries(snapshot.values);
    if (snapshot.coverage !== entries.length || snapshot.coverage > knownCodes.size) {
      throw new Error(`Ungültige Gemeindeabdeckung der Einnahmenübersicht für ${year}.`);
    }
    for (const [code, value] of entries) {
      if (!knownCodes.has(code)) throw new Error(`Unbekannter Gemeindecode in der Einnahmenübersicht: ${code}`);
      if (!isValidIncomeTuple(value)) throw new Error(`Ungültige Einnahmenübersicht für ${code}/${year}.`);
    }
  }
  return series;
}
