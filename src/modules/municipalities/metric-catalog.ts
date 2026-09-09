import type { KennzahlDefinition } from "./kennzahlen";
const AGE_INDICATOR_IDS = [
  "youth-share", "senior-share", "old-age-dependency", "child-dependency", "total-dependency",
  "aging-index", "average-age", "women-share", "women-per-100-men",
] as const;
const DERIVED_MOVEMENT_IDS = [
  "birth-rate", "death-rate", "birth-balance-rate", "migration-balance-rate",
  "international-migration-balance", "international-migration-balance-rate",
  "internal-migration-balance", "internal-migration-balance-rate", "statistical-correction",
] as const;
const INDICATOR_LABEL_KEYS: Record<(typeof AGE_INDICATOR_IDS)[number], string> = {
  "youth-share": "indicatorYouthShare", "senior-share": "indicatorSeniorShare",
  "old-age-dependency": "indicatorOldAgeDependency", "child-dependency": "indicatorChildDependency",
  "total-dependency": "indicatorTotalDependency", "aging-index": "indicatorAgingIndex",
  "average-age": "indicatorAverageAge", "women-share": "indicatorWomenShare",
  "women-per-100-men": "indicatorWomenPer100Men",
};
const MOVEMENT_LABEL_KEYS: Record<(typeof DERIVED_MOVEMENT_IDS)[number], string> = {
  "birth-rate": "movementBirthRate", "death-rate": "movementDeathRate",
  "birth-balance-rate": "movementBirthBalanceRate", "migration-balance-rate": "movementMigrationBalanceRate",
  "international-migration-balance": "movementInternationalBalance",
  "international-migration-balance-rate": "movementInternationalBalanceRate",
  "internal-migration-balance": "movementInternalBalance",
  "internal-migration-balance-rate": "movementInternalBalanceRate",
  "statistical-correction": "movementStatisticalCorrection",
};

/**
 * The entries the analysis tool offers for browsing. Parameterised families (age groups
 * by sex, cost categories) are listed once with a representative parameter — dragging a
 * concrete selection off the map still expands the exact combination that was chosen.
 */
export const KENNZAHL_CATALOG: KennzahlDefinition[] = [
  { id: "population-density", category: "population", labelKey: "populationDensity", output: { kind: "population", view: "density" } },
  { id: "population-foreign-share", category: "population", labelKey: "populationForeignShare", output: { kind: "population", view: "foreign-share" } },
  { id: "age-group-share", category: "age", labelKey: "ageMeasureShare", output: { kind: "age-group", ageGroup: "65-79", measure: "share", sex: "all" } },
  ...AGE_INDICATOR_IDS.map((indicator): KennzahlDefinition => ({
    id: `age-${indicator}`, category: "age", labelKey: INDICATOR_LABEL_KEYS[indicator],
    output: { kind: "age-indicator", indicator },
  })),
  ...DERIVED_MOVEMENT_IDS.map((metric): KennzahlDefinition => ({
    id: `movement-${metric}`, category: "movement", labelKey: MOVEMENT_LABEL_KEYS[metric],
    output: { kind: "movement", metric },
  })),
  { id: "cost-share", category: "costs", labelKey: "costMeasureShare", output: { kind: "cost-share", category: "0", measure: "share" } },
  { id: "cost-per-capita", category: "costs", labelKey: "costMeasurePerCapita", output: { kind: "cost-share", category: "0", measure: "per-capita" } },
  { id: "cost-real-per-capita", category: "costs", labelKey: "costMeasureRealPerCapita", output: { kind: "cost-share", category: "0", measure: "real-per-capita" } },
  { id: "cost-peer-deviation", category: "costs", labelKey: "costMeasurePeerDeviation", output: { kind: "cost-share", category: "0", measure: "peer-deviation" } },
];

