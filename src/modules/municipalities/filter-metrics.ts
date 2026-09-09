import { KENNZAHL_CATALOG } from "./metric-catalog";
import { AGE_GROUPS, demographicIndicatorValue, demographyMetricValue } from "./demography";
import { COST_TARGETS, municipalityCostShare, municipalityCostPerCapita, municipalityCostRealPerCapita } from "./costs";
import { movementTargetValue } from "./movement";
import { populationViewValue } from "./structure";
import { createPeerMedianIndex } from "./peer-medians";
import type { MunicipalityAnalysisData } from "./analysis";
import type { KennzahlDefinition } from "./kennzahlen";

/** Expand parameterised catalog entries so every choice has a stable bookmark identity. */
export const FILTER_METRICS: KennzahlDefinition[] = KENNZAHL_CATALOG.flatMap(definition => {
  const output = definition.output;
  if (output.kind === "age-group") return AGE_GROUPS.flatMap(group => (["all", "female", "male"] as const).map(sex => ({ ...definition, id: `${definition.id}:${group.id}:${sex}`, output: { ...output, ageGroup: group.id, sex } })));
  if (output.kind === "cost-share") return COST_TARGETS.map(category => ({ ...definition, id: `${definition.id}:${category}`, output: { ...output, category } }));
  return [definition];
});
export function filterMetric(id: string) { return FILTER_METRICS.find(metric => metric.id === id); }
export function filterMetricLabel(id: string, t: (key: string) => string): string {
  const metric = filterMetric(id);
  if (!metric) return id;
  const output = metric.output;
  if (output.kind === "cost-share") return `${t(output.category === "total" ? "costCategoryTotal" : `costCategory${output.category}`)} · ${t(metric.labelKey)}`;
  if (output.kind === "age-group") return `${t(`ageGroup${output.ageGroup}`)} · ${t(`sex${output.sex === "all" ? "All" : output.sex === "female" ? "Female" : "Male"}`)} · ${t(metric.labelKey)}`;
  return t(metric.labelKey);
}
const municipalities = new WeakMap<MunicipalityAnalysisData, Map<string, MunicipalityAnalysisData["index"]["municipalities"][number]>>();
const peers = new WeakMap<MunicipalityAnalysisData, ReturnType<typeof createPeerMedianIndex>>();
/** Same primary calculations as Überblick. Shares are exposed as percentages for input. */
function calculateFilterMetric(id: string, code: string, year: number, data: MunicipalityAnalysisData): number | null {
  const output = filterMetric(id)?.output;
  let byCode = municipalities.get(data);
  if (!byCode) { byCode = new Map(data.index.municipalities.map(item => [item.municipalityCode, item])); municipalities.set(data, byCode); }
  const municipality = byCode.get(code);
  if (!output || !municipality) return null;
  const population = data.population.years[String(year)]?.values[code];
  let value: number | null = null;
  let percentage = false;
  if (output.kind === "population") {
    value = population === undefined ? null : populationViewValue(output.view, population, municipality, data.structure?.years[String(year)]?.values[code] ?? null);
    percentage = output.view === "foreign-share";
  } else if (output.kind === "age-group" || output.kind === "age-indicator") {
    const counts = data.demography?.years[String(year)]?.values[code];
    if (counts) value = output.kind === "age-group" ? demographyMetricValue(counts, output.sex, output.ageGroup, output.measure) : demographicIndicatorValue(counts, output.indicator);
    percentage = output.kind === "age-group" || output.indicator.endsWith("-share");
  } else if (output.kind === "movement") {
    const counts = data.movement?.years[String(year)]?.values[code];
    if (counts && population !== undefined) value = movementTargetValue(counts, population, output.metric);
  } else if (output.kind === "cost-share") {
    const tuple = data.costs?.years[String(year)]?.values[code];
    percentage = output.measure === "share" || output.measure === "peer-deviation";
    if (tuple) {
      if (output.measure === "share") value = municipalityCostShare(tuple, output.category);
      else if (population !== undefined) {
        if (output.measure === "real-per-capita") value = municipalityCostRealPerCapita(tuple, output.category, population, year);
        else {
          value = municipalityCostPerCapita(tuple, output.category, population);
          if (output.measure === "peer-deviation") {
            let lookup = peers.get(data);
            if (!lookup) { lookup = createPeerMedianIndex(data); peers.set(data, lookup); }
            const median = lookup(code, year, output.category);
            value = value !== null && median !== null && median > 0 ? value / median - 1 : null;
          }
        }
      }
    }
  }
  return value === null || !Number.isFinite(value) ? null : percentage ? value * 100 : value;
}
export function filterMetricUnit(id: string, t: (key: string) => string): string {
  const output = filterMetric(id)?.output;
  if (!output) return "";
  if (output.kind === "population") return output.view === "density" ? t("units.per-square-kilometer") : "%";
  if (output.kind === "age-group") return "%";
  if (output.kind === "age-indicator") return output.indicator.endsWith("-share") ? "%" : t(output.indicator === "average-age" ? "units.years" : "units.per-100");
  if (output.kind === "movement") return t(output.metric.endsWith("-rate") ? "units.per-1000" : "units.persons");
  if (output.kind === "cost-share") return output.measure === "share" || output.measure === "peer-deviation" ? "%" : t("units.currency-per-person");
  return "";
}

const metricValues = new WeakMap<MunicipalityAnalysisData, Map<string, Map<string, number | null>>>();
export function readFilterMetric(id: string, code: string, year: number, data: MunicipalityAnalysisData): number | null {
  let cache = metricValues.get(data);
  if (!cache) { cache = new Map(); metricValues.set(data, cache); }
  const key = `${id}|${year}`;
  let values = cache.get(key);
  if (!values) { values = new Map(); cache.set(key, values); }
  if (!values.has(code)) values.set(code, calculateFilterMetric(id, code, year, data));
  return values.get(code) ?? null;
}
