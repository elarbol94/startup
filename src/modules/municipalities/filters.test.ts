import { FILTER_METRICS, filterMetricLabel, filterMetricUnit, readFilterMetric } from "./filter-metrics";
import { datasetUnit } from "./analysis";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { combineMatches, conditionSchema, defaultCondition, evaluateCondition, evaluateMunicipalityFilter, exampleMunicipalityFilter, municipalityFilterSchema, negateMatch, providerMatch, readFilterField, type Match } from "./filters";
import { filterToAnalysisGraph } from "./filter-graph";
import { applyMunicipalityAnalysisGraphOperations, evaluateAnalysisGraph, parseMunicipalityAnalysisGraph, serializeMunicipalityAnalysisGraph, type MunicipalityAnalysisData } from "./analysis";
import { createKennzahlLookup, kennzahlFromGraph, parseKennzahlExpression, serializeKennzahlExpression } from "./kennzahlen";
import type { MunicipalityDigitalPlatformProfile } from "./digital-platforms";
const read = (file: string) => JSON.parse(readFileSync(new URL(`../../../public/data/${file}`, import.meta.url), "utf8"));
const data: MunicipalityAnalysisData = { index: read("municipalities-at-2026.index.json"), population: read("municipality-population-2002-2025.json"), digital: read("municipality-digital-platforms.json"), demography: null, movement: null, costs: null, structure: null };
const municipality = data.index.municipalities[0];
const profile = (researchStatus: "complete" | "partial", names: string[]): MunicipalityDigitalPlatformProfile => ({ name: "Test", state: "Burgenland", researchStatus, result: names.length ? "platforms-found" : "none-found-beyond-official-website", checkedAt: "2026-08-25", officialWebsite: null, platforms: names.map((name, i) => ({ id: String(i), name, provider: name, kind: "citizen-app", channels: [], relationship: "official", status: "active", url: "https://example.com", sourceIds: [], evidenceNote: "", confidence: "high", lastVerifiedAt: "2026-08-25" })), missingReason: null, blockers: [], notes: [] });
function withProfile(value: MunicipalityDigitalPlatformProfile) { return { ...data, digital: { ...data.digital!, municipalities: { [municipality.municipalityCode]: value } } }; }
describe("municipality conditions", () => {
  it("exposes raw values without converting missing research into zero", () => {
    expect(readFilterField("population", municipality, 2025, data)).toBe(data.population.years["2025"].values[municipality.municipalityCode]);
    expect(readFilterField("state", municipality, 2025, data)).toBe(municipality.state);
    expect(readFilterField("providers", municipality, 2025, withProfile(profile("complete", ["GEM2GO", "CITIES"])))).toEqual(["gem2go", "cities"]);
    expect(readFilterField("providers", municipality, 2025, withProfile(profile("complete", [])))).toEqual([]);
    expect(readFilterField("citizen-app", municipality, 2025, withProfile(profile("partial", [])))).toBeNull();
    expect(readFilterField("citizen-app", municipality, 2025, withProfile(profile("complete", [])))).toBe(0);
  });
  it("implements three-valued AND, OR and NOT", () => {
    const values: Match[] = [true, false, null];
    for (const a of values) for (const b of values) {
      expect(combineMatches([a, b], "and")).toBe(a === false || b === false ? false : a === null || b === null ? null : true);
      expect(combineMatches([a, b], "or")).toBe(a === true || b === true ? true : a === null || b === null ? null : false);
    }
    expect(negateMatch(null)).toBeNull();
  });
  it("matches individual providers in a multi-provider municipality", () => {
    expect(providerMatch(profile("complete", ["GEM2GO", "CITIES"]), ["cities"])).toBe(true);
    expect(providerMatch(profile("partial", ["GEM2GO"]), ["cities"])).toBeNull();
    expect(providerMatch(profile("partial", ["GEM2GO"]), ["gem2go"])).toBe(true);
    expect(providerMatch(profile("complete", ["GEM2GO"]), ["cities"])).toBe(false);
    expect(providerMatch(undefined, ["cities"])).toBeNull();
  });
  it("never treats incomplete research as no app or an exact count", () => {
    const rule = defaultCondition("availability");
    expect(evaluateCondition(rule, municipality, 2025, withProfile(profile("partial", [])))).toBeNull();
    expect(evaluateCondition({ ...rule, negate: true }, municipality, 2025, withProfile(profile("partial", [])))).toBeNull();
    expect(evaluateCondition(rule, municipality, 2025, withProfile(profile("complete", [])))).toBe(true);
    expect(evaluateCondition({ field: "citizen-app", operator: "eq", value: 1, negate: false }, municipality, 2025, withProfile(profile("partial", ["CITIES"])))).toBeNull();
  });
  it("honours strict population boundaries and missing years", () => {
    for (const value of [2000, 2001, 2999, 3000]) {
      const fixture = { ...withProfile(profile("complete", [])), population: { ...data.population, years: { "2025": { ...data.population.years["2025"], values: { [municipality.municipalityCode]: value } } } } };
      expect(evaluateMunicipalityFilter(exampleMunicipalityFilter, municipality, fixture)).toBe(value > 2000 && value < 3000);
      expect(evaluateCondition(defaultCondition("population"), municipality, 2024, fixture)).toBeNull();
    }
  });
  it("validates fields, categories, numeric ranges, and complexity", () => {
    expect(conditionSchema.safeParse({ field: "providers", operator: "gt", value: 1 }).success).toBe(false);
    expect(conditionSchema.safeParse({ field: "providers", operator: "in", values: [] }).success).toBe(false);
    expect(conditionSchema.safeParse({ field: "population", operator: "between", value: 3000, upper: 2000 }).success).toBe(false);
    expect(conditionSchema.safeParse({ field: "population", operator: "gt", value: NaN }).success).toBe(false);
    expect(municipalityFilterSchema.safeParse({ ...exampleMunicipalityFilter, groups: [] }).success).toBe(false);
  });
  it("keeps filter, graph and persisted Kennzahl results identical, including negated groups", () => {
    for (const negate of [false, true]) {
      const filter = { ...exampleMunicipalityFilter, groups: [{ ...exampleMunicipalityFilter.groups[0], negate }] };
      const graph = parseMunicipalityAnalysisGraph(serializeMunicipalityAnalysisGraph(filterToAnalysisGraph(filter)));
      const metric = kennzahlFromGraph(graph, graph.selectedNodeId!);
      expect(metric.ok).toBe(true);
      if (!metric.ok) throw new Error("Invalid graph");
      const lookup = createKennzahlLookup(parseKennzahlExpression(serializeKennzahlExpression(metric.expression)), data);
      for (const municipality of data.index.municipalities) {
        const expected = evaluateMunicipalityFilter(filter, municipality, data);
        expect(lookup(municipality.municipalityCode, 2025)).toBe(expected === null ? null : expected ? 1 : 0);
      }
      const subject = { municipalityCode: municipality.municipalityCode, municipalityName: municipality.name };
      const evaluated = evaluateAnalysisGraph({ ...graph, subject }, data);
      expect(evaluated.get(graph.selectedNodeId!)?.points.find(p => p.year === 2025)?.value).toBe(evaluateMunicipalityFilter(filter, municipality, data));
    }
  });
  it("persists condition edits through the validated operation reducer", () => {
    const graph = filterToAnalysisGraph(exampleMunicipalityFilter);
    const updated = applyMunicipalityAnalysisGraphOperations(graph, [{ version: 1, type: "update-condition", nodeId: graph.nodes[0].id, condition: defaultCondition("providers") }]).graph;
    const node = parseMunicipalityAnalysisGraph(serializeMunicipalityAnalysisGraph(updated)).nodes[0];
    expect(node.type === "dataset" && node.data.dataset.kind === "condition" && node.data.dataset.condition.field).toBe("providers");
  });
});

describe("Kennzahl filter conditions", () => {
  const fullData: MunicipalityAnalysisData = { ...data, demography: read("municipality-demography-2002-2025.json"), movement: read("municipality-movement-2002-2025.json"), structure: read("municipality-structure-2022-2024.json"), costs: read("municipality-cost-shares-2010-2024.json") };
  it.each(FILTER_METRICS)("agrees with the overview evaluator for $id, including percentage conversion", (metric) => {
      const lookup = createKennzahlLookup({ input: metric.output }, fullData);
      const percent = datasetUnit(metric.output) === "share";
      for (const item of fullData.index.municipalities.filter((_, index) => index % 200 === 0)) {
        for (const year of [2010, 2024, 2025]) {
          const expected = lookup(item.municipalityCode, year);
          const actual = readFilterMetric(metric.id, item.municipalityCode, year, fullData);
          if (expected === null) expect(actual, metric.id).toBeNull();
          else expect(actual, metric.id).toBeCloseTo(expected * (percent ? 100 : 1), 8);
        }
      }
  });
  it("supports negative thresholds and rejects unknown metrics or inverted intervals", () => {
    const condition = { field: "metric", metricId: "movement-migration-balance-rate", operator: "between", value: -10, upper: 0, negate: false };
    expect(conditionSchema.safeParse(condition).success).toBe(true);
    expect(conditionSchema.safeParse({ ...condition, metricId: "missing" }).success).toBe(false);
    expect(conditionSchema.safeParse({ ...condition, upper: -20 }).success).toBe(false);
  });
  it("preserves percentage conditions through bookmarks, analysis and saved Kennzahlen", () => {
    const condition = conditionSchema.parse({ field: "metric", metricId: "age-senior-share", operator: "between", value: 20, upper: 30 });
    const filter = municipalityFilterSchema.parse(JSON.parse(JSON.stringify({ ...exampleMunicipalityFilter, year: 2024, groups: [{ mode: "and", negate: false, conditions: [condition] }] })));
    const graph = filterToAnalysisGraph(filter);
    const subject = { municipalityCode: municipality.municipalityCode, municipalityName: municipality.name };
    const expected = evaluateMunicipalityFilter(filter, municipality, fullData);
    expect(evaluateAnalysisGraph({ ...graph, subject }, fullData).get(graph.selectedNodeId!)?.points.find(point => point.year === 2024)?.value).toBe(expected);
    const saved = kennzahlFromGraph(graph, graph.selectedNodeId!);
    expect(saved.ok).toBe(true);
    if (saved.ok) expect(createKennzahlLookup(saved.expression, fullData)(municipality.municipalityCode, 2024)).toBe(expected === null ? null : Number(expected));
    const missing = conditionSchema.parse({ ...condition, metricId: "cost-share:0", negate: true });
    expect(evaluateCondition(missing, municipality, 2025, fullData)).toBeNull();
  });
  it("has German and English titles and units for every expanded metric", () => {
    for (const locale of ["de", "en"]) {
      const messages = JSON.parse(readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), "utf8")).municipalities;
      const translate = (key: string): string => {
        const value = key.split(".").reduce((current, part) => current?.[part], messages);
        expect(typeof value, `${locale}:${key}`).toBe("string");
        return value;
      };
      for (const metric of FILTER_METRICS) { filterMetricLabel(metric.id, translate); filterMetricUnit(metric.id, translate); }
    }
  });
});
