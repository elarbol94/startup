// What the map offers per Datenart: the view lists behind the Ausgangsdaten/Kennzahlen dropdowns and
// the Ausgangsdaten catalogue assembled from them. Used through kennzahlen.ts.
import { COST_TARGETS, type CostMeasureId } from "./costs";
import { INCOME_TARGETS } from "./income";
import { AGE_GROUPS, AGE_TARGETS, DEMOGRAPHIC_INDICATORS, type AgeMeasure, type AgeViewId, type MapMetric } from "./demography";
import { DIGITAL_PLATFORM_VIEWS, type DigitalPlatformViewId } from "./digital-platforms";
import { datasetClass, type DataKind, type KennzahlInput } from "./kennzahlen-expression";
import { MOVEMENT_METRICS, MOVEMENT_RAW_TARGETS, type MovementTargetId } from "./movement";
import type { PoliticsView } from "./politics";
import type { PopulationViewId } from "./structure";

// --- what each dropdown offers per Datenart ---------------------------------

/**
 * The map's first dropdown picks the Datenart, the third one lists what that Datenart
 * offers for the chosen category. These lists are the single source of truth for that
 * filtering; `kennzahlen.test.ts` checks each entry against `datasetClass`, so a view
 * cannot end up on the wrong side of the split.
 */
export const POPULATION_VIEWS_BY_KIND: Record<DataKind, readonly PopulationViewId[]> = {
  base: ["count", "foreign-persons", "structure-population"],
  derived: ["density", "foreign-share"],
};

const AGE_GROUP_IDS = AGE_GROUPS.map(({ id }) => id);
export const AGE_VIEWS_BY_KIND: Record<DataKind, readonly AgeViewId[]> = {
  base: AGE_GROUP_IDS,
  derived: [...AGE_GROUP_IDS, ...DEMOGRAPHIC_INDICATORS.map(({ id }) => id)],
};

/** Persons under Ausgangsdaten, share under Kennzahlen — the measure follows the Datenart. */
export const ageMeasureFor = (kind: DataKind): AgeMeasure => (kind === "base" ? "persons" : "share");

export const MOVEMENT_VIEWS_BY_KIND: Record<DataKind, readonly MovementTargetId[]> = {
  base: [
    ...MOVEMENT_METRICS.filter(({ id }) => datasetClass({ kind: "movement", metric: id }) === "base").map(({ id }) => id),
    ...MOVEMENT_RAW_TARGETS,
  ],
  derived: MOVEMENT_METRICS.filter(({ id }) => datasetClass({ kind: "movement", metric: id }) === "derived").map(({ id }) => id),
};

export const COST_MEASURES_BY_KIND: Record<DataKind, readonly CostMeasureId[]> = {
  base: ["absolute"],
  derived: ["share", "per-capita", "real-per-capita", "peer-deviation"],
};

export const POLITICS_VIEWS_BY_KIND: Record<DataKind, readonly PoliticsView[]> = {
  // The winning list is read straight off the result; the share and the turnout are both
  // quotients of it.
  base: ["leading-list"],
  derived: ["party-share", "turnout"],
};

// The digital inventory is all Ausgangsdaten; its cost estimates live in the detail panel
// rather than as a map layer, so there is nothing to offer under Kennzahlen.
export const DIGITAL_VIEWS_BY_KIND: Record<DataKind, readonly DigitalPlatformViewId[]> = {
  base: DIGITAL_PLATFORM_VIEWS.map(({ id }) => id),
  derived: [],
};

/**
 * Every Ausgangsdatum the analysis can read, so a graph can be built without going to the
 * map and dragging one back. Assembled from the same `*_BY_KIND` lists the map's dropdowns
 * use, which keeps the two offers from drifting apart.
 *
 * No `labelKey`: `datasetTitle` already names any dataset reference, and it is the one
 * that stays right when a view is added. Age groups are listed for both sexes together
 * because that is the only distinction the title does not spell out.
 */
export type AusgangsdatumDefinition = { id: string; category: MapMetric; output: KennzahlInput };

export const AUSGANGSDATEN_CATALOG: AusgangsdatumDefinition[] = [
  ...POPULATION_VIEWS_BY_KIND.base.map((view): AusgangsdatumDefinition => ({
    id: `population-${view}`, category: "population", output: { kind: "population", view },
  })),
  { id: "attribute-area", category: "population", output: { kind: "attribute", field: "area" } },
  ...AGE_TARGETS.map((ageGroup): AusgangsdatumDefinition => ({
    id: `age-${ageGroup}`, category: "age",
    output: { kind: "age-group", ageGroup, measure: "persons", sex: "all" },
  })),
  ...MOVEMENT_VIEWS_BY_KIND.base.map((metric): AusgangsdatumDefinition => ({
    id: `movement-${metric}`, category: "movement", output: { kind: "movement", metric },
  })),
  ...[...COST_TARGETS, ...INCOME_TARGETS].map((category): AusgangsdatumDefinition => ({
    id: `cost-${category}`, category: "costs",
    output: { kind: "cost-share", category, measure: "absolute" },
  })),
];

const ALL_METRICS: readonly MapMetric[] = ["population", "age", "movement", "costs", "politics", "digital", "custom"];
const VIEW_COUNT: Record<MapMetric, Record<DataKind, number>> = {
  population: { base: POPULATION_VIEWS_BY_KIND.base.length, derived: POPULATION_VIEWS_BY_KIND.derived.length },
  age: { base: AGE_VIEWS_BY_KIND.base.length, derived: AGE_VIEWS_BY_KIND.derived.length },
  movement: { base: MOVEMENT_VIEWS_BY_KIND.base.length, derived: MOVEMENT_VIEWS_BY_KIND.derived.length },
  costs: { base: COST_MEASURES_BY_KIND.base.length, derived: COST_MEASURES_BY_KIND.derived.length },
  politics: { base: POLITICS_VIEWS_BY_KIND.base.length, derived: POLITICS_VIEWS_BY_KIND.derived.length },
  digital: { base: DIGITAL_VIEWS_BY_KIND.base.length, derived: DIGITAL_VIEWS_BY_KIND.derived.length },
  // A user-defined Kennzahl is derived by definition; whether the category is offered at
  // all depends on the user having saved one, which only the caller knows.
  custom: { base: 0, derived: 1 },
};

/** A category is offered only while it has something to show for that Datenart. */
export const MAP_METRICS_BY_KIND: Record<DataKind, readonly MapMetric[]> = {
  base: ALL_METRICS.filter((metric) => VIEW_COUNT[metric].base > 0),
  derived: ALL_METRICS.filter((metric) => VIEW_COUNT[metric].derived > 0),
};

export const isDataKind = (value: string | null): value is DataKind =>
  value === "base" || value === "derived";
