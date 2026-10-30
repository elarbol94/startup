// Evaluating a Kennzahl for the whole map: one O(1) reader per Ausgangsdatum and the expression walked
// per municipality and year. Used through kennzahlen.ts.
import { createPeerMedianIndex } from "./peer-medians";
import { evaluateCondition, combineMatches } from "./filters";
import type { MunicipalityAnalysisData } from "./analysis";
import { costViewValue } from "./cost-view";
import { demographicIndicatorValue, demographyMetricValue } from "./demography";
import type { KennzahlExpression, KennzahlInput } from "./kennzahlen-expression";
import { movementTargetValue } from "./movement";
import { populationViewValue } from "./structure";

// --- evaluating a Kennzahl for the whole map --------------------------------

/**
 * Peer medians for the cost comparison, cached per category and year.
 *
 * `resolveMunicipalityDataset` recomputes this per municipality, which is fine for a
 * single node but quadratic across 2.092 municipalities. This builds the whole year in
 * one pass instead, and is the only copy — both the map and the Kennzahl evaluator use it.
 */
type ValueReader = (code: string, year: number) => number | null;

function baseReader(
  input: KennzahlInput,
  data: MunicipalityAnalysisData,
  peerMedianFor: ReturnType<typeof createPeerMedianIndex>,
): ValueReader {
  const byCode = new Map(data.index.municipalities.map((item) => [item.municipalityCode, item]));

  if (input.kind === "condition") return (code, year) => {
    const municipality = byCode.get(code);
    const value = municipality ? evaluateCondition(input.condition, municipality, year, data) : null;
    return value === null ? null : value ? 1 : 0;
  };
  if (input.kind === "attribute") return (code) => byCode.get(code)?.areaSquareKilometers ?? null;

  if (input.kind === "population") return (code, year) => {
    const municipality = byCode.get(code);
    const inhabitants = data.population.years[String(year)]?.values[code];
    if (!municipality || inhabitants === undefined) return null;
    return populationViewValue(input.view, inhabitants, municipality, data.structure?.years[String(year)]?.values[code] ?? null);
  };

  if (input.kind === "age-group") return (code, year) => {
    const counts = data.demography?.years[String(year)]?.values[code];
    return counts ? demographyMetricValue(counts, input.sex, input.ageGroup, input.measure) : null;
  };

  if (input.kind === "age-indicator") return (code, year) => {
    const counts = data.demography?.years[String(year)]?.values[code];
    return counts ? demographicIndicatorValue(counts, input.indicator) : null;
  };

  if (input.kind === "movement") return (code, year) => {
    const counts = data.movement?.years[String(year)]?.values[code];
    const inhabitants = data.population.years[String(year)]?.values[code];
    if (!counts || inhabitants === undefined) return null;
    return movementTargetValue(counts, inhabitants, input.metric);
  };

  const measure = input.measure ?? "share";
  const category = input.category;
  return (code, year) => {
    const inhabitants = data.population.years[String(year)]?.values[code];
    if (measure !== "peer-deviation") return costViewValue(data, code, year, category, measure, inhabitants);
    const perCapita = costViewValue(data, code, year, category, "per-capita", inhabitants);
    const peerMedian = peerMedianFor(code, year, category);
    return perCapita !== null && peerMedian && peerMedian > 0 ? perCapita / peerMedian - 1 : null;
  };
}

/**
 * A `(code, year) => value` reader for a Kennzahl, fast enough to paint the whole map.
 *
 * Each Ausgangsdatum is resolved through an O(1) lookup and the expression is walked per
 * cell, so a Kennzahl costs the same order of work as a built-in one.
 */
export function createKennzahlLookup(
  expression: KennzahlExpression,
  data: MunicipalityAnalysisData,
  peerMedianFor: ReturnType<typeof createPeerMedianIndex> = createPeerMedianIndex(data),
): ValueReader {
  const readers = new Map<string, ValueReader>();
  const prepare = (node: KennzahlExpression) => {
    if ("input" in node) {
      const key = JSON.stringify(node.input);
      if (!readers.has(key)) readers.set(key, baseReader(node.input, data, peerMedianFor));
    } else if ("op" in node) {
      prepare(node.a);
      if ("b" in node) prepare(node.b);
    }
  };
  prepare(expression);

  const evaluate = (node: KennzahlExpression, code: string, year: number): number | null => {
    if ("constant" in node) return node.constant;
    if ("input" in node) return readers.get(JSON.stringify(node.input))!(code, year);
    // The map asks for one year at a time, so a shift is simply that question asked of an
    // earlier year; years before the data start read as null, exactly like a gap.
    if (!("b" in node)) return evaluate(node.a, code, year - node.years);
    const a = evaluate(node.a, code, year);
    const b = evaluate(node.b, code, year);
    if (node.op === "and" || node.op === "or") {
      const value = combineMatches([a === null ? null : a !== 0, b === null ? null : b !== 0], node.op);
      return value === null ? null : value ? 1 : 0;
    }
    if (a === null || b === null) return null;
    switch (node.op) {
      case "add": return a + b;
      case "subtract": return a - b;
      case "multiply": return a * b;
      case "divide": return b === 0 ? null : a / b;
      // Comparisons paint the map as 0/1 so a threshold Kennzahl still has a colour.
      case "greater-than": return a > b ? 1 : 0;
      case "greater-or-equal": return a >= b ? 1 : 0;
      case "less-than": return a < b ? 1 : 0;
      case "less-or-equal": return a <= b ? 1 : 0;
      case "equal": return a === b ? 1 : 0;
      case "not-equal": return a !== b ? 1 : 0;
      default: return null;
    }
  };
  return (code, year) => evaluate(expression, code, year);
}
