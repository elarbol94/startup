// Evaluating a municipality analysis graph: resolving a dataset node into a yearly series, combining
// series with an operator, units, and the CSV export of a series. Used through analysis.ts.
import { evaluateCondition, combineMatches } from "./filters";
import type { MunicipalityDigitalPlatformDataset } from "./digital-platforms";
import {
  DEFAULT_ANALYSIS_SHIFT_YEARS,
  type AnalysisOperatorId,
  type AnalysisSubject,
  type MunicipalityAnalysisGraph,
  type MunicipalityDatasetRef,
} from "./analysis-schema";
import {
  municipalityCostAbsolute,
  municipalityCostShare,
  median,
  municipalityCostPerCapita,
  municipalityCostRealPerCapita,
  municipalityPopulationBand,
  type MunicipalityCostSeries,
} from "./costs";
import type { MunicipalityIndex } from "./data";
import {
  demographicIndicatorUnit,
  demographicIndicatorValue,
  demographyMetricValue,
  type MunicipalityDemographySeries,
} from "./demography";
import {
  movementTargetUnit,
  movementTargetValue,
  type MunicipalityMovementSeries,
} from "./movement";
import type { MunicipalityPopulationSeries } from "./population";
import {
  populationViewUnit,
  populationViewValue,
  type MunicipalityStructureSeries,
} from "./structure";

export type AnalysisPoint = { year: number; value: number | boolean | null };
export type AnalysisSeries = {
  unit: string; valueType: "number" | "boolean"; points: AnalysisPoint[];
  error: "missing-input" | "incompatible-units" | "missing-municipality" | "no-common-years" | null;
  warnings: Array<{ year: number; code: "division-by-zero" }>;
};
export type MunicipalityAnalysisData = {
  index: MunicipalityIndex;
  population: MunicipalityPopulationSeries;
  structure: MunicipalityStructureSeries | null;
  demography: MunicipalityDemographySeries | null;
  movement: MunicipalityMovementSeries | null;
  costs: MunicipalityCostSeries | null;
  digital?: MunicipalityDigitalPlatformDataset | null;
};

export function datasetUnit(dataset: MunicipalityDatasetRef) {
  if (dataset.kind === "condition") return "boolean";
  if (dataset.kind === "population") return populationViewUnit(dataset.view);
  if (dataset.kind === "age-group") return dataset.measure;
  if (dataset.kind === "age-indicator") return demographicIndicatorUnit(dataset.indicator);
  if (dataset.kind === "movement") return movementTargetUnit(dataset.metric);
  if (dataset.kind === "attribute") return "square-kilometers";
  if (dataset.kind === "constant") return "";
  const measure = dataset.measure ?? "share";
  if (measure === "absolute") return "currency";
  return measure === "per-capita" || measure === "real-per-capita"
    ? "currency-per-person" : "share";
}

// `AnalysisSeries.unit` stays a machine identity because operators compare it for
// compatibility; only the rendered label is translated.
export const ANALYSIS_UNIT_IDS = [
  "persons", "per-square-kilometer", "share", "per-100", "per-1000", "years", "currency-per-person",
  "currency", "square-kilometers",
] as const;

export function analysisUnitLabel(unit: string, translate: (id: (typeof ANALYSIS_UNIT_IDS)[number]) => string) {
  if (!unit || unit === "boolean") return "";
  return unit
    .split(/([·/])/)
    .map((part) => (ANALYSIS_UNIT_IDS as readonly string[]).includes(part)
      ? translate(part as (typeof ANALYSIS_UNIT_IDS)[number])
      : part)
    .join("");
}

/**
 * The series as CSV, semicolon-separated with a decimal comma — what Excel opens without
 * an import wizard in a de-AT locale. Missing years stay as empty cells rather than being
 * dropped, so the column still lines up with a second export next to it.
 */
export function analysisSeriesToCsv(series: AnalysisSeries, headers: { year: string; value: string }) {
  const cell = (value: number | boolean | null) => {
    if (value === null) return "";
    if (typeof value === "boolean") return value ? "1" : "0";
    return String(value).replace(".", ",");
  };
  const escape = (value: string) => (/[";\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);
  return [
    `${escape(headers.year)};${escape(headers.value)}`,
    ...series.points.map(({ year, value }) => `${year};${cell(value)}`),
  ].join("\n");
}

export function resolveMunicipalityDataset(
  dataset: MunicipalityDatasetRef,
  data: MunicipalityAnalysisData,
  /** Which municipality open nodes are about; a pinned node ignores it. */
  subject: AnalysisSubject | null = null,
): AnalysisSeries {
  const points: AnalysisPoint[] = [];
  const firstYear = dataset.kind === "cost-share" ? (data.costs?.firstYear ?? 2010) : data.population.firstYear;
  const latestYear = dataset.kind === "cost-share" ? (data.costs?.latestYear ?? 2024) : data.population.latestYear;

  // A constant carries no municipality. It spans the population years so it intersects
  // with every other series an operator can pair it with.
  if (dataset.kind === "constant") {
    for (let year = firstYear; year <= latestYear; year += 1) points.push({ year, value: dataset.value });
    return { unit: datasetUnit(dataset), valueType: "number", points, error: null, warnings: [] };
  }

  // Pinned wins over the graph's subject; an open node without a subject has nothing to
  // read yet, which is a state to report rather than a series of nulls.
  const code = dataset.municipalityCode ?? subject?.municipalityCode ?? null;
  if (code === null) {
    return { unit: datasetUnit(dataset), valueType: dataset.kind === "condition" ? "boolean" : "number", points: [], error: "missing-municipality", warnings: [] };
  }

  if (dataset.kind === "condition") {
    const municipality = data.index.municipalities.find(item => item.municipalityCode === code);
    for (let year = firstYear; year <= latestYear; year += 1) points.push({ year, value: municipality ? evaluateCondition(dataset.condition, municipality, year, data) : null });
    return { unit: "boolean", valueType: "boolean", points, error: null, warnings: [] };
  }

  for (let year = firstYear; year <= latestYear; year += 1) {
    const population = data.population.years[String(year)].values[code];
    let value: number | null = null;
    if (dataset.kind === "attribute") {
      const municipality = data.index.municipalities.find((item) => item.municipalityCode === code);
      value = municipality ? municipality.areaSquareKilometers : null;
    } else if (dataset.kind === "population") {
      const municipality = data.index.municipalities.find(({ municipalityCode }) => municipalityCode === code);
      if (municipality) value = populationViewValue(
        dataset.view,
        population,
        municipality,
        data.structure?.years[String(year)]?.values[code] ?? null,
      );
    }
    else if (dataset.kind === "age-group") {
      const counts = data.demography?.years[String(year)]?.values[code];
      if (counts) value = demographyMetricValue(counts, dataset.sex, dataset.ageGroup, dataset.measure);
    } else if (dataset.kind === "age-indicator") {
      const counts = data.demography?.years[String(year)]?.values[code];
      if (counts) value = demographicIndicatorValue(counts, dataset.indicator);
    } else if (dataset.kind === "movement") {
      const counts = data.movement?.years[String(year)]?.values[code];
      if (counts) value = movementTargetValue(counts, population, dataset.metric);
    } else {
      const costs = data.costs?.years[String(year)]?.values[code];
      const measure = dataset.measure ?? "share";
      if (costs && measure === "absolute") value = municipalityCostAbsolute(costs, dataset.category);
      else if (costs && measure === "share") value = municipalityCostShare(costs, dataset.category);
      else if (costs && measure === "per-capita") {
        value = municipalityCostPerCapita(costs, dataset.category, population);
      } else if (costs && measure === "real-per-capita") {
        value = municipalityCostRealPerCapita(costs, dataset.category, population, year);
      } else if (costs) {
        const selected = data.index.municipalities.find(({ municipalityCode }) => municipalityCode === code);
        const selectedPerCapita = municipalityCostPerCapita(costs, dataset.category, population);
        if (selected && selectedPerCapita !== null) {
          const band = municipalityPopulationBand(population);
          const peers = data.index.municipalities.flatMap((municipality) => {
            const peerPopulation = data.population.years[String(year)].values[municipality.municipalityCode];
            const peerCosts = data.costs?.years[String(year)]?.values[municipality.municipalityCode];
            if (municipalityPopulationBand(peerPopulation) !== band || !peerCosts) return [];
            const peerValue = municipalityCostPerCapita(peerCosts, dataset.category, peerPopulation);
            return peerValue === null ? [] : [{ state: municipality.state, value: peerValue }];
          });
          const regionalPeers = peers.filter(({ state }) => state === selected.state);
          const comparison = regionalPeers.length >= 5 ? regionalPeers : peers;
          const peerMedian = median(comparison.map(({ value: peerValue }) => peerValue));
          value = peerMedian && peerMedian > 0 ? selectedPerCapita / peerMedian - 1 : null;
        }
      }
    }
    points.push({ year, value });
  }
  return { unit: datasetUnit(dataset), valueType: "number", points, error: null, warnings: [] };
}

const comparisonOperators = new Set<AnalysisOperatorId>(["greater-than", "greater-or-equal", "less-than", "less-or-equal", "equal", "not-equal"]);
const booleanOperators = new Set<AnalysisOperatorId>(["and", "or"]);
export const isBooleanAnalysisOperator = (operator: AnalysisOperatorId) =>
  comparisonOperators.has(operator) || booleanOperators.has(operator);

/**
 * The unit an operator produces. A dimensionless side contributes nothing, so scaling a
 * rate by 1.000 stays "persons/persons" instead of picking up a dangling separator.
 */
export function composeAnalysisUnit(operator: AnalysisOperatorId, left: string, right: string) {
  if (operator === "multiply") return !right ? left : !left ? right : `${left}·${right}`;
  if (operator === "divide") return !right ? left : `${left}/${right}`;
  return left || right;
}

export function evaluateAnalysisOperator(
  operator: AnalysisOperatorId,
  left: AnalysisSeries | null,
  right: AnalysisSeries | null,
  years: number = DEFAULT_ANALYSIS_SHIFT_YEARS,
): AnalysisSeries {
  const comparison = comparisonOperators.has(operator);
  const logical = booleanOperators.has(operator);
  const fail = (error: AnalysisSeries["error"]): AnalysisSeries => ({
    unit: comparison || logical ? "boolean" : "",
    valueType: comparison || logical ? "boolean" : "number",
    points: [], error, warnings: [],
  });

  // Shift moves the input forward in time, so the value at a year is what the input read
  // `years` earlier. Unit and value type are untouched; only the years move.
  if (operator === "shift") {
    if (!left) return fail("missing-input");
    if (left.error) return fail(left.error);
    return {
      unit: left.unit, valueType: left.valueType,
      points: left.points.map(({ year, value }) => ({ year: year + years, value })),
      error: null, warnings: [],
    };
  }

  if (!left || !right) return fail("missing-input");
  // An input that could not be computed is the reason this cannot be either — say so
  // here rather than showing an empty chart with no explanation.
  const inherited = left.error ?? right.error;
  if (inherited) return fail(inherited);
  if (logical) {
    if (left.valueType !== "boolean" || right.valueType !== "boolean") return fail("incompatible-units");
  } else if (left.valueType !== "number" || right.valueType !== "number") {
    return fail("incompatible-units");
  } else if (operator === "add" || operator === "subtract" || comparison) {
    // A constant is dimensionless, and "Einwohnerzahl > 2.000" is exactly what it is for,
    // so a bare number pairs with any unit instead of being rejected as incompatible.
    const dimensionless = !left.unit || !right.unit;
    if (left.unit !== right.unit && !dimensionless) return fail("incompatible-units");
  }
  const rightByYear = new Map(right.points.map((point) => [point.year, point.value]));
  const warnings: AnalysisSeries["warnings"] = [];
  const points = left.points.flatMap<AnalysisPoint>((point) => {
    if (!rightByYear.has(point.year)) return [];
    const a = point.value;
    const b = rightByYear.get(point.year);
    if (logical) {
      return [{ year: point.year, value: combineMatches([typeof a === "boolean" ? a : null, typeof b === "boolean" ? b : null], operator === "and" ? "and" : "or") }];
    }
    if (typeof a !== "number" || typeof b !== "number") return [{ year: point.year, value: null }];
    if (operator === "divide" && b === 0) { warnings.push({ year: point.year, code: "division-by-zero" }); return [{ year: point.year, value: null }]; }
    const value = operator === "add" ? a + b : operator === "subtract" ? a - b : operator === "multiply" ? a * b
      : operator === "divide" ? a / b : operator === "greater-than" ? a > b : operator === "greater-or-equal" ? a >= b
        : operator === "less-than" ? a < b : operator === "less-or-equal" ? a <= b
          : operator === "not-equal" ? a !== b : a === b;
    return [{ year: point.year, value }];
  });
  // Inputs are paired by year. Sharing none is not an empty result but an unanswerable
  // question, and an empty chart with no reason reads as a bug.
  if (!points.length) return fail("no-common-years");
  const valueType = comparison || logical ? "boolean" as const : "number" as const;
  const unit = comparison || logical ? "boolean" : composeAnalysisUnit(operator, left.unit, right.unit);
  return { unit, valueType, points, error: null, warnings };
}

export function evaluateAnalysisGraph(graph: MunicipalityAnalysisGraph, data: MunicipalityAnalysisData) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const results = new Map<string, AnalysisSeries>();
  const evaluating = new Set<string>();
  const evaluate = (id: string): AnalysisSeries | null => {
    const cached = results.get(id);
    if (cached) return cached;
    if (evaluating.has(id)) return null;
    const node = nodes.get(id);
    if (!node) return null;
    evaluating.add(id);
    let result: AnalysisSeries | null;
    if (node.type === "dataset") result = resolveMunicipalityDataset(node.data.dataset, data, graph.subject);
    else if (node.type === "operator") {
      const input = (handle: "a" | "b") => {
        const edge = graph.edges.find((item) => item.target === id && item.targetHandle === handle);
        return edge ? evaluate(edge.source) : null;
      };
      result = evaluateAnalysisOperator(node.data.operator, input("a"), input("b"), node.data.years);
    } else result = null;
    evaluating.delete(id);
    if (result) results.set(id, result);
    return result;
  };
  for (const id of nodes.keys()) evaluate(id);
  return results;
}
