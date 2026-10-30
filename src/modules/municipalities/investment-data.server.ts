import "server-only";

import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  validateMunicipalityInvestmentData,
  type MunicipalityInvestmentData,
} from "./investments";

const DATA_DIRECTORY = resolve("public/data/municipality-investments");

export async function loadMunicipalityInvestmentData(code: string) {
  if (!/^\d{5}$/.test(code)) return null;
  try {
    return validateMunicipalityInvestmentData(JSON.parse(
      await readFile(resolve(DATA_DIRECTORY, `${code}.json`), "utf8"),
    ) as MunicipalityInvestmentData);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Whether the investment page exists, without parsing a file that can run to megabytes. */
export async function hasMunicipalityInvestmentData(code: string) {
  if (!/^\d{5}$/.test(code)) return false;
  return access(resolve(DATA_DIRECTORY, `${code}.json`)).then(() => true, () => false);
}
