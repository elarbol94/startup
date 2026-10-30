// What a Kennzahl is: the input and expression types, the Ausgangsdaten/Kennzahl split, how every
// built-in Kennzahl derives from Ausgangsdaten, and reading an expression's text, inputs and unit.
// Used through kennzahlen.ts.
import { filterMetric } from "./filter-metrics";
import {
  ANALYSIS_OPERATOR_SYMBOLS,
  isBooleanAnalysisOperator,
  type AnalysisBinaryOperatorId,
  type AnalysisUnaryOperatorId,
  composeAnalysisUnit,
  datasetUnit,
  type MunicipalityDatasetRef,
} from "./analysis";
import { isIncomeTargetId, type CostViewTarget } from "./income";
import type { AgeTargetId, MapMetric, SexFilter } from "./demography";
import type { MovementTargetId } from "./movement";

/**
 * Ausgangsdaten are read straight out of a data file; Kennzahlen are computed from them.
 *
 * The built-in Kennzahlen keep their hand-written implementations as the map's execution
 * path — those run over 2.092 municipalities × 24 years and are already tested. What
 * lives here is a second, declarative description of the same arithmetic, used to show
 * the derivation in the analysis tool and to evaluate user-defined Kennzahlen.
 * `kennzahlen.test.ts` asserts the two agree, so they cannot drift apart.
 */
export type DataKind = "base" | "derived";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A dataset reference with the municipality left open — the parameter of a Kennzahl. */
export type KennzahlInput = DistributiveOmit<
  Exclude<MunicipalityDatasetRef, { kind: "constant" }>,
  "municipalityCode" | "municipalityName"
>;

export type KennzahlExpression =
  | { input: KennzahlInput }
  | { constant: number }
  | { op: AnalysisBinaryOperatorId; a: KennzahlExpression; b: KennzahlExpression }
  // A unary operator reads one side plus its year count; `b` is what tells the two apart.
  | { op: AnalysisUnaryOperatorId; a: KennzahlExpression; years: number };

export type KennzahlDefinition = {
  id: string;
  category: MapMetric;
  /** Key in the `municipalities` message namespace. */
  labelKey: string;
  output: KennzahlInput;
};

/** Ties an input to a municipality, or leaves it open when none is given. */
export function bindKennzahlInput(
  input: KennzahlInput,
  municipalityCode?: string,
  municipalityName?: string,
): MunicipalityDatasetRef {
  return (municipalityCode
    ? { ...input, municipalityCode, municipalityName }
    : { ...input }) as MunicipalityDatasetRef;
}

// --- classification ---------------------------------------------------------

const MOVEMENT_BASE_METRICS = new Set<MovementTargetId>([
  "population-change", "births", "deaths", "arrivals", "departures",
  "international-arrivals", "international-departures", "internal-arrivals", "internal-departures",
]);

export function datasetClass(input: KennzahlInput): DataKind {
  if (input.kind === "condition") return "derived";
  if (input.kind === "attribute") return "base";
  if (input.kind === "population") {
    return input.view === "density" || input.view === "foreign-share" ? "derived" : "base";
  }
  if (input.kind === "age-group") return input.measure === "share" ? "derived" : "base";
  if (input.kind === "age-indicator") return "derived";
  if (input.kind === "movement") return MOVEMENT_BASE_METRICS.has(input.metric) ? "base" : "derived";
  return (input.measure ?? "share") === "absolute" ? "base" : "derived";
}

// --- expression construction ------------------------------------------------

const inp = (input: KennzahlInput): KennzahlExpression => ({ input });
const con = (constant: number): KennzahlExpression => ({ constant });
const bin = (op: AnalysisBinaryOperatorId, a: KennzahlExpression, b: KennzahlExpression): KennzahlExpression => ({ op, a, b });
const add = (a: KennzahlExpression, b: KennzahlExpression) => bin("add", a, b);
const sub = (a: KennzahlExpression, b: KennzahlExpression) => bin("subtract", a, b);
const mul = (a: KennzahlExpression, b: KennzahlExpression) => bin("multiply", a, b);
const div = (a: KennzahlExpression, b: KennzahlExpression) => bin("divide", a, b);

const POPULATION = inp({ kind: "population", view: "count" });
const AREA = inp({ kind: "attribute", field: "area" });
const age = (ageGroup: AgeTargetId, sex: SexFilter = "all") =>
  inp({ kind: "age-group", ageGroup, measure: "persons", sex });
const move = (metric: MovementTargetId) => inp({ kind: "movement", metric });
const cost = (category: CostViewTarget) => inp({ kind: "cost-share", category, measure: "absolute" });

const youth = add(age("0-5"), age("6-14"));
const seniors = add(age("65-79"), age("80-plus"));
const workingAge = add(add(age("15-24"), age("25-44")), age("45-64"));
const perMille = (numerator: KennzahlExpression) => mul(div(numerator, POPULATION), con(1_000));
const internationalBalance = sub(move("international-arrivals"), move("international-departures"));
const internalBalance = sub(move("internal-arrivals"), move("internal-departures"));

/**
 * How a Kennzahl is built from Ausgangsdaten, or `null` when it is a primary calculation
 * that the current node vocabulary cannot express.
 *
 * ponytail: the four `null` cases need vocabulary this graph does not have —
 * `average-age` the per-person age sum, `real-per-capita` a year-varying reference series
 * (the CPI), `peer-deviation` an aggregate operator over other municipalities, and
 * politics/digital their own base datasets. Add those node kinds when someone needs to
 * edit one of these; until then the catalogue shows them as Primärberechnung.
 */
export function kennzahlExpressionFor(output: KennzahlInput): KennzahlExpression | null {
  if (datasetClass(output) === "base") return inp(output);

  if (output.kind === "population") {
    if (output.view === "density") return div(POPULATION, AREA);
    // Both citizenship figures come from the same 31 October snapshot; the Einwohner-
    // zeitreihe counts on 1 January and would give a different denominator.
    return div(
      inp({ kind: "population", view: "foreign-persons" }),
      inp({ kind: "population", view: "structure-population" }),
    );
  }

  if (output.kind === "age-group") {
    return div(age(output.ageGroup, output.sex), age("total", output.sex));
  }

  if (output.kind === "age-indicator") {
    const indicator = output.indicator;
    if (indicator === "youth-share") return div(youth, age("total"));
    if (indicator === "senior-share") return div(seniors, age("total"));
    if (indicator === "old-age-dependency") return mul(div(seniors, workingAge), con(100));
    if (indicator === "child-dependency") return mul(div(youth, workingAge), con(100));
    if (indicator === "total-dependency") return mul(div(add(youth, seniors), workingAge), con(100));
    if (indicator === "aging-index") return mul(div(seniors, youth), con(100));
    if (indicator === "women-share") return div(age("total", "female"), age("total"));
    if (indicator === "women-per-100-men") return mul(div(age("total", "female"), age("total", "male")), con(100));
    return null; // average-age
  }

  if (output.kind === "movement") {
    const metric = output.metric;
    if (metric === "birth-rate") return perMille(move("births"));
    if (metric === "death-rate") return perMille(move("deaths"));
    if (metric === "birth-balance-rate") return perMille(sub(move("births"), move("deaths")));
    if (metric === "migration-balance-rate") return perMille(sub(move("arrivals"), move("departures")));
    if (metric === "international-migration-balance") return internationalBalance;
    if (metric === "international-migration-balance-rate") return perMille(internationalBalance);
    if (metric === "internal-migration-balance") return internalBalance;
    if (metric === "internal-migration-balance-rate") return perMille(internalBalance);
    // Gesamtveränderung minus Geburtenbilanz minus Wanderungsbilanz.
    return sub(
      sub(move("population-change"), sub(move("births"), move("deaths"))),
      sub(move("arrivals"), move("departures")),
    );
  }

  // `attribute` is always base and returned above; only cost measures are left.
  if (output.kind !== "cost-share") return null;
  const measure = output.measure ?? "share";
  // A share is of its own side: Auszahlungen of all Auszahlungen, Einzahlungen of all Einzahlungen.
  if (measure === "share") return div(cost(output.category), cost(isIncomeTargetId(output.category) ? "income-total" : "total"));
  if (measure === "per-capita") return div(cost(output.category), POPULATION);
  return null; // real-per-capita, peer-deviation
}

/** Drops the municipality from a dataset reference, leaving the Kennzahl parameter. */
export function unbindKennzahlInput(dataset: MunicipalityDatasetRef): KennzahlInput | null {
  if (dataset.kind === "constant") return null;
  const { municipalityCode, municipalityName, ...input } = dataset;
  void municipalityCode;
  void municipalityName;
  return input as KennzahlInput;
}

/** `(Geburten ÷ Einwohnerzahl) × 1.000` — the derivation as one readable line. */
export function kennzahlFormulaText(
  expression: KennzahlExpression,
  label: (input: KennzahlInput) => string,
  formatNumber: (value: number) => string = String,
): string {
  const render = (node: KennzahlExpression, parenthesise: boolean): string => {
    if ("input" in node) return label(node.input);
    if ("constant" in node) return formatNumber(node.constant);
    // `t−1` rather than a symbol: a shift reads as an offset on its input, not as an
    // operation between two of them.
    if (!("b" in node)) return `${render(node.a, true)} (t−${node.years})`;
    const text = `${render(node.a, true)} ${ANALYSIS_OPERATOR_SYMBOLS[node.op]} ${render(node.b, true)}`;
    return parenthesise ? `(${text})` : text;
  };
  return render(expression, false);
}

/** Every Ausgangsdatum a Kennzahl reads, for working out which data files it needs. */
export function kennzahlExpressionInputs(expression: KennzahlExpression): KennzahlInput[] {
  if ("input" in expression) {
    const input = expression.input;
    if (input.kind === "condition" && input.condition.field === "custom-metric") return [input, ...kennzahlExpressionInputs(input.condition.expression)];
    const metric = input.kind === "condition" && input.condition.field === "metric" ? filterMetric(input.condition.metricId) : null;
    return metric ? [input, metric.output] : [input];
  }
  if ("op" in expression) {
    return "b" in expression
      ? [...kennzahlExpressionInputs(expression.a), ...kennzahlExpressionInputs(expression.b)]
      : kennzahlExpressionInputs(expression.a);
  }
  return [];
}

export function kennzahlExpressionUnit(expression: KennzahlExpression): string {
  if ("constant" in expression) return "";
  if ("input" in expression) return datasetUnit(expression.input as MunicipalityDatasetRef);
  // A shift moves years, not units.
  if (!("b" in expression)) return kennzahlExpressionUnit(expression.a);
  if (isBooleanAnalysisOperator(expression.op)) return "boolean";
  return composeAnalysisUnit(
    expression.op,
    kennzahlExpressionUnit(expression.a),
    kennzahlExpressionUnit(expression.b),
  );
}
