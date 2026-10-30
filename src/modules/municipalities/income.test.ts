import { describe, expect, it } from "vitest";
import { aggregateMunicipalityIncomeCsv } from "../../../scripts/update-municipality-income";
import {
  INCOME_TUPLE_LENGTH,
  compoundAnnualGrowth,
  incomeCategoryCents,
  incomeCategoryForRow,
  municipalityIncomeFacts,
  municipalityIncomeYears,
  percentileRank,
  populationClassIndex,
  quantileBreaks,
  summarizeIncomeSegment,
  tierFor,
  validateMunicipalityIncomeSeries,
  type MunicipalityIncomeSeries,
} from "./income";

const header = "Jahr;Bundesland;Voranschlag/Rechnungsabschluss;Datenquelle;Gemeindekennziffer;Gemeindename;Haushalt;Ansatz-Uab;Ansatz-Ugl;Konto-Grp;Konto-Ugl;Vorhabencode;Mvag;Ansatz-Text;Konto-Text;Wert";
const row = (mvag: string, account: string, value: string) =>
  `2024;Kärnten;Rechnungsabschluss;"Statistik Austria";20501;Althofen;Finanzierungshaushalt;000;000;${account};000;0000000;${mvag};"Ansatz";"Konto";${value}`;

describe("municipality income importer", () => {
  it("maps MVAG and account groups to income categories", () => {
    expect(incomeCategoryForRow("3111", "833")).toBe("communalTax");
    expect(incomeCategoryForRow("3111", "831")).toBe("propertyTax");
    expect(incomeCategoryForRow("3111", "850")).toBe("otherOwnTaxes");
    expect(incomeCategoryForRow("3112", "859")).toBe("sharedTaxes");
    expect(incomeCategoryForRow("3116", "829")).toBe("otherOperating");
    expect(incomeCategoryForRow("3121", "861")).toBe("transfersState");
    expect(incomeCategoryForRow("3124", "868")).toBe("transfersOther");
    expect(incomeCategoryForRow("3135", "822")).toBe("financialIncome");
    expect(incomeCategoryForRow("3331", "300")).toBe("investive");
    expect(incomeCategoryForRow("3511", "341")).toBeNull();
    expect(incomeCategoryForRow("3221", "500")).toBeNull();
  });

  it("sums income, keeps loans and outflows outside the total, and computes the balances", () => {
    const tuple = aggregateMunicipalityIncomeCsv([
      header,
      row("3111", "833", "300,00"), row("3111", "831", "100,00"),
      row("3112", "859", "500,00"), row("3121", "861", "100,00"),
      row("3331", "300", "50,00"),
      row("3511", "341", "1.000,00"),
      row("3221", "500", "700,00"), row("3614", "650", "80,00"),
      row("3415", "042", "999,00"),
    ].join("\n"), "20501", 2024);
    expect(tuple).toHaveLength(INCOME_TUPLE_LENGTH);
    expect(tuple[0]).toBe(105_000);
    expect(incomeCategoryCents(tuple, "communalTax")).toBe(30_000);
    const facts = municipalityIncomeFacts(tuple, 10);
    expect(facts.total).toBe(1_050);
    expect(facts.operating).toBe(1_000);
    expect(facts.fiscalCapacity).toBe(900);
    expect(facts.loans).toBe(1_000);
    expect(facts.operatingBalance).toBe(300);
    expect(facts.freeBalance).toBe(220);
    expect(facts.totalPerCapita).toBe(105);
    expect(facts.ownShare).toBeCloseTo(400 / 1_050);
    expect(facts.transferShare).toBeCloseTo(100 / 1_050);
    expect(facts.operatingMargin).toBeCloseTo(0.3);
    expect(municipalityIncomeFacts(tuple, undefined).totalPerCapita).toBeNull();
  });

  it("rejects foreign metadata and statements without income", () => {
    expect(() => aggregateMunicipalityIncomeCsv([header, row("3111", "833", "1,00")].join("\n"), "20502", 2024)).toThrow("Unerwartete Metadaten");
    expect(() => aggregateMunicipalityIncomeCsv([header, row("3221", "500", "1,00")].join("\n"), "20501", 2024)).toThrow("Nicht positive");
  });
});

describe("municipality income market figures", () => {
  it("ranks, tiers and grows consistently", () => {
    expect(percentileRank([1, 2, 3, 4], 3)).toBe(0.625);
    expect(percentileRank([], 3)).toBeNull();
    expect(compoundAnnualGrowth(100, 121, 2)).toBeCloseTo(0.1);
    expect(compoundAnnualGrowth(null, 121, 2)).toBeNull();
    expect(compoundAnnualGrowth(-5, 121, 2)).toBeNull();
    const breaks = quantileBreaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(breaks).toEqual([3, 5, 7, 9]);
    expect([1, 3, 10].map((value) => tierFor(value, breaks))).toEqual([0, 1, 4]);
    expect(populationClassIndex(999)).toBe(0);
    expect(populationClassIndex(1_000)).toBe(1);
    expect(populationClassIndex(250_000)).toBe(5);
  });

  it("weights per-capita income by people but medians by municipality", () => {
    const facts = (total: number, population: number) => municipalityIncomeFacts(
      [total * 100, total * 100, ...Array.from({ length: INCOME_TUPLE_LENGTH - 2 }, () => 0)], population,
    );
    const summary = summarizeIncomeSegment([
      { code: "1", population: 100, facts: facts(100_000, 100) },
      { code: "2", population: 900, facts: facts(900_000, 900) },
      { code: "3", population: 1_000, facts: facts(3_000_000, 1_000) },
    ]);
    expect(summary.total).toBe(4_000_000);
    expect(summary.totalPerCapita).toBe(2_000);
    expect(summary.medianTotalPerCapita).toBe(1_000);
    expect(summary.negativeFreeBalance).toBe(0);
  });

  it("validates the generated series", () => {
    const tuple = [100, 100, ...Array.from({ length: INCOME_TUPLE_LENGTH - 2 }, () => 0)];
    const series = {
      schemaVersion: 1, firstYear: 2010, latestYear: 2024, unit: "cents",
      categories: ["communalTax", "propertyTax", "otherOwnTaxes", "sharedTaxes", "fees", "services", "property", "otherOperating", "transfersFederal", "transfersState", "transfersOther", "financialIncome", "investive"],
      generatedAt: "2026-10-30T00:00:00.000Z",
      source: { title: "Test", url: "https://www.offenerhaushalt.at/", origin: "Statistik Austria" },
      years: Object.fromEntries(municipalityIncomeYears().map((year) => [year, { coverage: 1, values: { "20501": tuple } }])),
    } as MunicipalityIncomeSeries;
    expect(validateMunicipalityIncomeSeries(series, ["20501"])).toBe(series);
    expect(() => validateMunicipalityIncomeSeries(series, ["20502"])).toThrow("Unbekannter Gemeindecode");
    series.years["2024"].values["20501"] = [100, 50, ...tuple.slice(2)];
    expect(() => validateMunicipalityIncomeSeries(series, ["20501"])).toThrow("Ungültige Einnahmenübersicht");
  });
});
