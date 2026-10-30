import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { MunicipalityIndex } from "../src/modules/municipalities/data";
import { validateMunicipalityIndex } from "../src/modules/municipalities/data";
import {
  INCOME_CATEGORY_IDS,
  INCOME_TUPLE_LENGTH,
  MUNICIPALITY_INCOME_FILE,
  MUNICIPALITY_INCOME_FIRST_YEAR,
  MUNICIPALITY_INCOME_LATEST_YEAR,
  MUNICIPALITY_INCOME_SCHEMA_VERSION,
  incomeCategoryForRow,
  municipalityIncomeYears,
  validateMunicipalityIncomeSeries,
  type MunicipalityIncomeSeries,
  type MunicipalityIncomeTuple,
} from "../src/modules/municipalities/income";
import { parseEuroCents, parseSemicolonCsv } from "./municipality-budget-csv";

// Only the Statistik Austria files: they exist for every year and Gemeinde alike, so
// coverage does not depend on which Gemeinden upload their own Rechnungsabschluss.
const FILE_PATTERN = /^(\d{5})_(201\d|202[0-4])_ra_fhh_statistik_at\.csv$/;
const REQUIRED_COLUMNS = [
  "Jahr", "Voranschlag/Rechnungsabschluss", "Datenquelle", "Gemeindekennziffer",
  "Haushalt", "Konto-Grp", "Mvag", "Wert",
] as const;

export function aggregateMunicipalityIncomeCsv(source: string, expectedCode: string, expectedYear: number): MunicipalityIncomeTuple {
  const rows = parseSemicolonCsv(source);
  const header = rows.shift();
  if (!header) throw new Error("Leere Einnahmenübersichtsdatei.");
  const columns = new Map(header.map((name, index) => [name, index]));
  for (const name of REQUIRED_COLUMNS) if (!columns.has(name)) throw new Error(`Fehlende CSV-Spalte: ${name}`);
  const valueAt = (row: string[], name: (typeof REQUIRED_COLUMNS)[number]) => row[columns.get(name)!] ?? "";
  const tuple = Array.from({ length: INCOME_TUPLE_LENGTH }, () => 0);
  for (const row of rows) {
    if (
      valueAt(row, "Jahr") !== String(expectedYear)
      || valueAt(row, "Gemeindekennziffer") !== expectedCode
      || valueAt(row, "Voranschlag/Rechnungsabschluss") !== "Rechnungsabschluss"
      || valueAt(row, "Datenquelle") !== "Statistik Austria"
      || valueAt(row, "Haushalt") !== "Finanzierungshaushalt"
    ) throw new Error(`Unerwartete Metadaten in ${expectedCode}/${expectedYear}.`);
    const mvag = valueAt(row, "Mvag");
    const cents = parseEuroCents(valueAt(row, "Wert"));
    const category = incomeCategoryForRow(mvag, valueAt(row, "Konto-Grp"));
    if (category) tuple[INCOME_CATEGORY_IDS.indexOf(category) + 1] += cents;
    else if (mvag.startsWith("35")) tuple[INCOME_CATEGORY_IDS.length + 1] += cents;
    else if (mvag.startsWith("32")) tuple[INCOME_CATEGORY_IDS.length + 2] += cents;
    else if (mvag.startsWith("36")) tuple[INCOME_CATEGORY_IDS.length + 3] += cents;
  }
  tuple[0] = tuple.slice(1, INCOME_CATEGORY_IDS.length + 1).reduce((sum, value) => sum + value, 0);
  if (!tuple.every(Number.isSafeInteger)) throw new Error(`Einnahmensumme außerhalb des sicheren Bereichs für ${expectedCode}/${expectedYear}.`);
  if (tuple[0] <= 0) throw new Error(`Nicht positive Gesamteinzahlungen für ${expectedCode}/${expectedYear}.`);
  return tuple;
}

function argument(arguments_: string[], name: string) {
  const index = arguments_.indexOf(name);
  return index >= 0 ? arguments_[index + 1] : undefined;
}

async function main() {
  const arguments_ = process.argv.slice(2);
  const sourceRoot = argument(arguments_, "--source-root");
  if (!sourceRoot) throw new Error('Aufruf: npm run data:municipality-income -- --source-root "/pfad/zu/Daten" [--output datei.json]');
  const outputPath = resolve(argument(arguments_, "--output") ?? `public/data/${MUNICIPALITY_INCOME_FILE}`);
  const index = validateMunicipalityIndex(JSON.parse(
    await readFile(resolve("public/data/municipalities-at-2026.index.json"), "utf8"),
  ) as MunicipalityIndex);
  const knownCodes = new Set(index.municipalities.map(({ municipalityCode }) => municipalityCode));
  const sourceFiles = (await readdir(resolve(sourceRoot), { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile() && FILE_PATTERN.test(entry.name))
    .map((entry) => resolve(entry.parentPath, entry.name))
    .sort();
  const years: MunicipalityIncomeSeries["years"] = Object.fromEntries(
    municipalityIncomeYears().map((year) => [String(year), { coverage: 0, values: {} }]),
  );
  const seen = new Set<string>();
  for (let position = 0; position < sourceFiles.length; position += 1) {
    const path = sourceFiles[position];
    const [, code, year] = FILE_PATTERN.exec(basename(path))!;
    if (!knownCodes.has(code)) throw new Error(`Unbekannter Gemeindecode in Quelldatei: ${code}`);
    const key = `${code}/${year}`;
    if (seen.has(key)) throw new Error(`Doppelte Einnahmenübersichtsdatei für ${key}.`);
    seen.add(key);
    years[year].values[code] = aggregateMunicipalityIncomeCsv(await readFile(path, "utf8"), code, Number(year));
    if ((position + 1) % 1_000 === 0) process.stdout.write(`${position + 1}/${sourceFiles.length} `);
  }
  for (const snapshot of Object.values(years)) snapshot.coverage = Object.keys(snapshot.values).length;
  const series: MunicipalityIncomeSeries = {
    schemaVersion: MUNICIPALITY_INCOME_SCHEMA_VERSION,
    firstYear: MUNICIPALITY_INCOME_FIRST_YEAR,
    latestYear: MUNICIPALITY_INCOME_LATEST_YEAR,
    unit: "cents",
    categories: INCOME_CATEGORY_IDS,
    generatedAt: new Date().toISOString(),
    source: {
      title: "Statistik Austria via OffenerHaushalt.at",
      url: "https://www.offenerhaushalt.at/",
      origin: "Statistik Austria",
    },
    years,
  };
  validateMunicipalityIncomeSeries(series, knownCodes);
  await writeFile(outputPath, `${JSON.stringify(series)}\n`);
  process.stdout.write(`\nEinnahmenübersicht 2010–2024: ${sourceFiles.length} Gemeinderechnungsabschlüsse → ${outputPath}\n`);
}

if (process.env.NODE_ENV !== "test") void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
