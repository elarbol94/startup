// The single `(code, year) => value` reader behind the workspace map, its peer medians and its year range.
// Used by municipalities-workspace.tsx.
import {
  municipalityCostPerCapita,
  municipalityCostRealPerCapita,
  municipalityCostShare,
  type CostMeasureId,
  type CostTargetId,
  type MunicipalityCostSeries,
} from "../../costs";
import type { MunicipalityIndex } from "../../data";
import type { MunicipalityDigitalPlatformDataset } from "../../digital-platforms";
import {
  demographicIndicatorValue,
  demographyMetricValue,
  isDemographicIndicatorId,
  type AgeGroupId,
  type AgeMeasure,
  type AgeViewId,
  type MapMetric,
  type MunicipalityDemographySeries,
  type SexFilter,
} from "../../demography";
import {
  movementTargetValue,
  type MovementTargetId,
  type MunicipalityMovementSeries,
} from "../../movement";
import {
  createKennzahlLookup,
  createPeerMedianIndex,
  kennzahlExpressionInputs,
  type KennzahlExpression,
} from "../../kennzahlen";
import type { MunicipalityPopulationSeries } from "../../population";
import {
  populationViewValue,
  type MunicipalityStructureSeries,
  type PopulationViewId,
} from "../../structure";

type DatasetSelection = {
  metric: MapMetric;
  populationView: PopulationViewId;
  ageView: AgeViewId;
  ageMeasure: AgeMeasure;
  sex: SexFilter;
  movementView: MovementTargetId;
  costCategory: CostTargetId;
  costMeasure: CostMeasureId;
  customExpression: KennzahlExpression | null;
};
type DatasetSeries = {
  digital?: MunicipalityDigitalPlatformDataset | null;
  index: MunicipalityIndex;
  population: MunicipalityPopulationSeries;
  structure: MunicipalityStructureSeries | null;
  demography: MunicipalityDemographySeries | null;
  movement: MunicipalityMovementSeries | null;
  costs: MunicipalityCostSeries | null;
};

/**
 * One `(code, year) => value` reader for the selected dataset, plus its own peer-median
 * cache. Both the map's per-year values and the colour domain go through it, so the
 * domain can never be computed from a different definition than the map paints.
 */
export function createDatasetLookup(selection: DatasetSelection, data: DatasetSeries) {
  const { metric, populationView, ageView, ageMeasure, sex, movementView, costCategory, costMeasure, customExpression } = selection;
  const { index, population, structure, demography, movement, costs } = data;
  const byCode = new Map(index.municipalities.map((item) => [item.municipalityCode, item]));
  const indicator = isDemographicIndicatorId(ageView) ? ageView : null;
  const ageGroup = indicator ? "0-5" as AgeGroupId : ageView as AgeGroupId;
  // One shared implementation of the peer comparison, also used to evaluate user-defined
  // Kennzahlen — see createPeerMedianIndex.
  const peerMedianIndex = createPeerMedianIndex({ index, population, structure, demography, movement, costs });
  const peerMedianFor = (code: string, year: number) => peerMedianIndex(code, year, costCategory);

  const customLookup = customExpression
    ? createKennzahlLookup(customExpression, { index, population, structure, demography, movement, costs, digital: data.digital }, peerMedianIndex)
    : null;

  const valueFor = (code: string, year: number): number | null => {
    const key = String(year);
    if (metric === "custom") return customLookup ? customLookup(code, year) : null;
    if (metric === "population") {
      const municipality = byCode.get(code);
      const inhabitants = population.years[key]?.values[code];
      if (!municipality || inhabitants === undefined) return null;
      return populationViewValue(populationView, inhabitants, municipality, structure?.years[key]?.values[code] ?? null);
    }
    if (metric === "age") {
      const counts = demography?.years[key]?.values[code];
      if (!counts) return null;
      return indicator
        ? demographicIndicatorValue(counts, indicator)
        : demographyMetricValue(counts, sex, ageGroup, ageMeasure);
    }
    if (metric === "movement") {
      const counts = movement?.years[key]?.values[code];
      const inhabitants = population.years[key]?.values[code];
      if (!counts || inhabitants === undefined) return null;
      return movementTargetValue(counts, inhabitants, movementView);
    }
    const tuple = costs?.years[key]?.values[code];
    if (!tuple) return null;
    if (costMeasure === "share") return municipalityCostShare(tuple, costCategory);
    const inhabitants = population.years[key]?.values[code];
    if (inhabitants === undefined) return null;
    if (costMeasure === "real-per-capita") {
      return municipalityCostRealPerCapita(tuple, costCategory, inhabitants, year);
    }
    const perCapita = municipalityCostPerCapita(tuple, costCategory, inhabitants);
    if (costMeasure === "per-capita") return perCapita;
    const peerMedian = peerMedianFor(code, year);
    return perCapita !== null && peerMedian && peerMedian > 0 ? perCapita / peerMedian - 1 : null;
  };

  /** The years the selected dataset actually covers. */
  const years = () => {
    const usesCosts = metric === "custom"
      ? (customExpression ? kennzahlExpressionInputs(customExpression).some(({ kind }) => kind === "cost-share") : false)
      : metric === "costs";
    const series = usesCosts ? costs : metric === "age" ? demography : metric === "movement" ? movement : population;
    return series ? Object.keys(series.years).map(Number) : [];
  };

  return { valueFor, peerMedianFor, years };
}
