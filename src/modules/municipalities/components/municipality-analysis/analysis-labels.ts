// Translated titles for analysis datasets, saved analyses and series errors.
// Used across the municipality analysis editor, catalog and landing page.
import type { useTranslations } from "next-intl";
import type { AnalysisSeries, MunicipalityDatasetRef } from "../../analysis";
import type { KennzahlInput } from "../../kennzahlen";
import type { MovementTargetId } from "../../movement";
import type { MunicipalityAnalysisSummary } from "../../queries";
import type { PopulationViewId } from "../../structure";
import { conditionLabel } from "../municipality-condition-editor";

/** "Bevölkerungsdichte · Steinfeld · 7 Knoten" — enough to tell two same-named ones apart. */
export function analysisOptionLabel(analysis: MunicipalityAnalysisSummary, t: ReturnType<typeof useTranslations>) {
  return [analysis.name, analysis.municipalityName, t("analysisNodeCount", { count: analysis.nodeCount })]
    .filter(Boolean).join(" · ");
}

export function seriesErrorLabel(error: AnalysisSeries["error"], t: ReturnType<typeof useTranslations>) {
  if (!error) return null;
  if (error === "missing-input") return t("analysisMissingInput");
  if (error === "incompatible-units") return t("analysisIncompatibleUnits");
  if (error === "no-common-years") return t("analysisNoCommonYears");
  return t("analysisMissingMunicipality");
}

// Exhaustive maps rather than ternary chains: a new Ausgangsdatum then fails to compile
// instead of silently borrowing the label of whatever the chain fell through to.
const POPULATION_VIEW_KEYS: Record<PopulationViewId, string> = {
  count: "populationCount", density: "populationDensity", "foreign-share": "populationForeignShare",
  "foreign-persons": "populationForeignPersons", "structure-population": "populationStructurePopulation",
};
const MOVEMENT_KEYS: Record<MovementTargetId, string> = {
  "population-change": "movementPopulationChange", births: "movementBirths", deaths: "movementDeaths",
  "birth-rate": "movementBirthRate", "death-rate": "movementDeathRate", "birth-balance-rate": "movementBirthBalanceRate",
  arrivals: "movementArrivals", departures: "movementDepartures",
  "migration-balance-rate": "movementMigrationBalanceRate",
  "international-migration-balance": "movementInternationalBalance",
  "international-migration-balance-rate": "movementInternationalBalanceRate",
  "internal-migration-balance": "movementInternalBalance",
  "internal-migration-balance-rate": "movementInternalBalanceRate",
  "statistical-correction": "movementStatisticalCorrection",
  "international-arrivals": "movementInternationalArrivals",
  "international-departures": "movementInternationalDepartures",
  "internal-arrivals": "movementInternalArrivals",
  "internal-departures": "movementInternalDepartures",
};

export function datasetTitle(dataset: MunicipalityDatasetRef | KennzahlInput, t: ReturnType<typeof useTranslations>, tf: ReturnType<typeof useTranslations>) {
  if (dataset.kind === "condition") return conditionLabel(dataset.condition, tf, t);
  if (dataset.kind === "constant") return String(dataset.value);
  if (dataset.kind === "attribute") return t("attributeArea");
  if (dataset.kind === "cost-share") {
    const measure = dataset.measure ?? "share";
    const measureKey = measure === "absolute" ? "costMeasureAbsolute" : measure === "share" ? "costMeasureShare" : measure === "per-capita" ? "costMeasurePerCapita" : measure === "real-per-capita" ? "costMeasureRealPerCapita" : "costMeasurePeerDeviation";
    const categoryLabel = dataset.category === "total" ? t("costCategoryTotal") : t(`costCategory${dataset.category}` as "costCategory0");
    return `${t("metricCosts")} · ${categoryLabel} · ${t(measureKey)}`;
  }
  if (dataset.kind === "population") return t(POPULATION_VIEW_KEYS[dataset.view] as "populationCount");
  if (dataset.kind === "movement") return t(MOVEMENT_KEYS[dataset.metric] as "movementBirths");
  if (dataset.kind === "age-group") {
    const groupLabel = dataset.ageGroup === "total"
      ? t("ageGroupTotal")
      : t(`ageGroup${dataset.ageGroup}` as "ageGroup0-5");
    return `${groupLabel} · ${t(dataset.measure === "share" ? "ageMeasureShare" : "ageMeasurePersons")}`;
  }
  const key = dataset.indicator === "youth-share" ? "indicatorYouthShare" : dataset.indicator === "senior-share" ? "indicatorSeniorShare" : dataset.indicator === "old-age-dependency" ? "indicatorOldAgeDependency" : dataset.indicator === "child-dependency" ? "indicatorChildDependency" : dataset.indicator === "total-dependency" ? "indicatorTotalDependency" : dataset.indicator === "aging-index" ? "indicatorAgingIndex" : dataset.indicator === "average-age" ? "indicatorAverageAge" : dataset.indicator === "women-share" ? "indicatorWomenShare" : "indicatorWomenPer100Men";
  return t(key);
}
