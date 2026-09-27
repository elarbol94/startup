import "server-only";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { searchMunicipalities, type MunicipalityIndex, type MunicipalityIndexItem } from "@/modules/municipalities/data";

export type MunicipalityOption = { code: string; name: string; state: string };

let cached: MunicipalityIndexItem[] | null = null;

/** The municipality list of the map section (public/data), read once per server process. */
function municipalities() {
  cached ??= (JSON.parse(readFileSync(resolve("public/data/municipalities-at-2026.index.json"), "utf8")) as MunicipalityIndex).municipalities;
  return cached;
}

const toOption = (item: MunicipalityIndexItem): MunicipalityOption => ({ code: item.municipalityCode, name: item.name, state: item.state });

export function findMunicipality(code: string): MunicipalityOption | null {
  const item = municipalities().find((municipality) => municipality.municipalityCode === code);
  return item ? toOption(item) : null;
}

/** Same matching as the map's search box: by name or code, accents ignored. */
export function searchMunicipalityOptions(query: string, limit = 8): MunicipalityOption[] {
  return searchMunicipalities(municipalities(), query, limit).map(toOption);
}

/** Resolves a submitted code to the stored pair; undefined means the code is unknown. */
export function municipalityColumns(code: string | null) {
  if (!code) return { municipalityCode: null, municipalityName: null };
  const municipality = findMunicipality(code);
  return municipality ? { municipalityCode: municipality.code, municipalityName: municipality.name } : undefined;
}
