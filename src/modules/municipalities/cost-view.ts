// One reader for a Kostenübersicht value — an Aufgabengruppe's Auszahlungen or an Einnahmenart —
// shared by the map, the analysis graph, the Kennzahl lookup and the filter.
import {
  municipalityCostAbsolute,
  municipalityCostPerCapita,
  municipalityCostRealPerCapita,
  municipalityCostShare,
  type CostMeasureId,
  type MunicipalityCostSeries,
} from "./costs";
import { isIncomeTargetId, municipalityIncomeValue, type CostViewTarget, type MunicipalityIncomeSeries } from "./income";

export type CostViewData = { costs: MunicipalityCostSeries | null; income?: MunicipalityIncomeSeries | null };

/** Every measure but peer deviation, which needs the other Gemeinden and is formed by the caller. */
export function costViewValue(
  data: CostViewData,
  code: string,
  year: number,
  category: CostViewTarget,
  measure: Exclude<CostMeasureId, "peer-deviation">,
  population: number | undefined,
): number | null {
  if (isIncomeTargetId(category)) {
    const tuple = data.income?.years[String(year)]?.values[code];
    return tuple ? municipalityIncomeValue(tuple, category, measure, population, year) : null;
  }
  const tuple = data.costs?.years[String(year)]?.values[code];
  if (!tuple) return null;
  if (measure === "absolute") return municipalityCostAbsolute(tuple, category);
  if (measure === "share") return municipalityCostShare(tuple, category);
  if (population === undefined) return null;
  if (measure === "real-per-capita") return municipalityCostRealPerCapita(tuple, category, population, year);
  return municipalityCostPerCapita(tuple, category, population);
}

/** The series a target reads, for its year span and for deciding which file to load. */
export function costViewSeries(data: CostViewData, category: CostViewTarget) {
  return isIncomeTargetId(category) ? data.income ?? null : data.costs;
}
