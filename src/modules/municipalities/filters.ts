import { filterMetric, readFilterMetric } from "./filter-metrics";
import type { MunicipalityAnalysisData } from "./analysis";
import { z } from "zod";
import type { MunicipalityIndexItem } from "./data";
import type { MunicipalityPopulationSeries } from "./population";
import { DIGITAL_PLATFORM_PROVIDER_FAMILIES, digitalPlatformProviderClassification, digitalPlatformsForView, type MunicipalityDigitalPlatformDataset, type MunicipalityDigitalPlatformProfile, type DigitalPlatformViewId } from "./digital-platforms";

export const numericFilterFields = ["population", "area", "citizen-app", "service-portal", "digital-notice-board", "website-cms", "waste-platform", "appointment-booking", "participation", "communication", "open-data", "other"] as const;
export const filterFields = [...numericFilterFields, "state", "providers", "availability", "research", "metric"] as const;
export type FilterField = typeof filterFields[number];
export const providerNames = { gem2go: "GEM2GO", cities: "CITIES", gemeinde24: "Gemeinde24", gemeindeapp: "GemeindeApp", "daheim-app": "Daheim App", "local-app": "Local/custom app" };
export const filterStates = ["Burgenland", "Kärnten", "Niederösterreich", "Oberösterreich", "Salzburg", "Steiermark", "Tirol", "Vorarlberg", "Wien"] as const;
const numericOperators = ["gt", "gte", "lt", "lte", "eq", "between"] as const;
export const conditionSchema = z.discriminatedUnion("field", [
  z.object({ field: z.literal("metric"), metricId: z.string().refine(id => Boolean(filterMetric(id))), operator: z.enum(numericOperators), value: z.number().finite(), upper: z.number().finite().optional(), negate: z.boolean().default(false) }).refine(r => r.operator !== "between" || (r.upper !== undefined && r.upper >= r.value)),
  z.object({ field: z.enum(numericFilterFields), operator: z.enum(numericOperators), value: z.number().finite().min(0), upper: z.number().finite().min(0).optional(), negate: z.boolean().default(false) }).refine(r => r.operator !== "between" || (r.upper !== undefined && r.upper >= r.value)),
  z.object({ field: z.literal("state"), operator: z.literal("in"), values: z.array(z.enum(filterStates)).min(1).max(9), negate: z.boolean().default(false) }),
  z.object({ field: z.literal("providers"), operator: z.literal("in"), values: z.array(z.enum(DIGITAL_PLATFORM_PROVIDER_FAMILIES)).min(1).max(6), negate: z.boolean().default(false) }),
  z.object({ field: z.literal("availability"), operator: z.literal("eq"), value: z.enum(["found", "none", "unknown"]), negate: z.boolean().default(false) }),
  z.object({ field: z.literal("research"), operator: z.literal("eq"), value: z.enum(["complete", "partial", "unknown"]), negate: z.boolean().default(false) }),
]);
export type FilterCondition = z.infer<typeof conditionSchema>;
export const filterGroupSchema = z.object({ mode: z.enum(["and", "or"]), negate: z.boolean().default(false), conditions: z.array(conditionSchema).min(1).max(20) });
export const municipalityFilterSchema = z.object({ version: z.literal(1), year: z.number().int().min(2002).max(2025), mode: z.enum(["and", "or"]), groups: z.array(filterGroupSchema).min(1).max(10) }).refine(filter => filter.groups.reduce((sum, group) => sum + group.conditions.length, 0) <= 50);
export type MunicipalityFilter = z.infer<typeof municipalityFilterSchema>;
export type Match = boolean | null;
export type FilterData = { population: MunicipalityPopulationSeries; digital?: MunicipalityDigitalPlatformDataset | null } & Partial<Omit<MunicipalityAnalysisData, "population" | "digital">>;
export function combineMatches(values: Match[], mode: "and" | "or"): Match {
  if (mode === "and" && values.includes(false)) return false;
  if (mode === "or" && values.includes(true)) return true;
  return values.includes(null) ? null : mode === "and";
}
export function negateMatch(value: Match): Match { return value === null ? null : !value; }
export function defaultCondition(field: FilterField): FilterCondition {
  if (field === "metric") return { field, metricId: "population-density", operator: "gt", value: 100, negate: false };
  if (field === "state") return { field, operator: "in", values: ["Steiermark"], negate: false };
  if (field === "providers") return { field, operator: "in", values: ["gem2go"], negate: false };
  if (field === "availability") return { field, operator: "eq", value: "none", negate: false };
  if (field === "research") return { field, operator: "eq", value: "complete", negate: false };
  return { field, operator: "gt", value: field === "population" ? 2000 : 0, negate: false };
}
export function providerMatch(profile: MunicipalityDigitalPlatformProfile | undefined, providers: readonly string[]): Match {
  if (!profile) return null;
  const classification = digitalPlatformProviderClassification(profile);
  if (classification?.providers.some(provider => providers.includes(provider))) return true;
  return profile.researchStatus === "complete" ? false : null;
}
/** Raw values shared by the explorer and condition evaluation; null means unknown. */
export function readFilterField(field: FilterField, municipality: MunicipalityIndexItem, year: number, data: FilterData, metricId?: string): number | string | string[] | null {
  if (field === "metric") return metricId && data.index ? readFilterMetric(metricId, municipality.municipalityCode, year, data as MunicipalityAnalysisData) : null;
  if (field === "population") return data.population.years[String(year)]?.values[municipality.municipalityCode] ?? null;
  if (field === "area") return municipality.areaSquareKilometers;
  if (field === "state") return municipality.state;
  const profile = data.digital?.municipalities[municipality.municipalityCode];
  if (field === "research") return profile?.researchStatus ?? null;
  const classification = profile ? digitalPlatformProviderClassification(profile) : null;
  if (field === "providers") return classification?.providers ?? null;
  if (field === "availability") return classification ? classification.providers.length ? "found" : "none" : null;
  return profile?.researchStatus === "complete" ? digitalPlatformsForView(profile, field as DigitalPlatformViewId).length : null;
}
export function evaluateCondition(rule: FilterCondition, municipality: MunicipalityIndexItem, year: number, data: FilterData): Match {
  const profile = data.digital?.municipalities[municipality.municipalityCode];
  let result: Match;
  if (rule.field === "providers") result = providerMatch(profile, rule.values);
  else if (rule.field === "state") result = rule.values.includes(municipality.state);
  else if (rule.field === "research") result = (profile?.researchStatus ?? "unknown") === rule.value;
  else if (rule.field === "availability") {
    const classification = profile ? digitalPlatformProviderClassification(profile) : null;
    const status = classification ? classification.providers.length ? "found" : "none" : "unknown";
    result = rule.value === "unknown" ? status === "unknown" : status === "unknown" ? null : status === rule.value;
  } else {
    const raw = readFilterField(rule.field, municipality, year, data, rule.field === "metric" ? rule.metricId : undefined);
    const value = typeof raw === "number" ? raw : null;
    result = value === null ? null : rule.operator === "gt" ? value > rule.value : rule.operator === "gte" ? value >= rule.value : rule.operator === "lt" ? value < rule.value : rule.operator === "lte" ? value <= rule.value : rule.operator === "between" ? value >= rule.value && value <= rule.upper! : value === rule.value;
  }
  return rule.negate ? negateMatch(result) : result;
}
export function evaluateMunicipalityFilter(filter: MunicipalityFilter, municipality: MunicipalityIndexItem, data: FilterData): Match {
  return combineMatches(filter.groups.map(group => {
    const value = combineMatches(group.conditions.map(rule => evaluateCondition(rule, municipality, filter.year, data)), group.mode);
    return group.negate ? negateMatch(value) : value;
  }), filter.mode);
}
export const initialMunicipalityFilter: MunicipalityFilter = { version: 1, year: 2025, mode: "and", groups: [{ mode: "and", negate: false, conditions: [defaultCondition("population")] }] };
export const exampleMunicipalityFilter: MunicipalityFilter = { ...initialMunicipalityFilter, groups: [{ mode: "and", negate: false, conditions: [defaultCondition("population"), { field: "population", operator: "lt", value: 3000, negate: false }, defaultCondition("availability")] }] };
