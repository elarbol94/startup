// Small pure helpers for the municipalities workspace: JSON fetching, URL-parameter coercion and formatting.
// Used by municipalities-workspace.tsx and the files in municipalities-workspace/.
import { COST_CATEGORIES, municipalityPopulationBand, type CostTargetId } from "../../costs";

export async function fetchJson<T>(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export type MunicipalityProfile = { district: string | null; officialWebsite: string | null; mayor: string | null; councilComposition: string | null };
export type MunicipalityProfileDataset = { profiles: Record<string, MunicipalityProfile> };
export const formatSigned = (value: number, formatter: Intl.NumberFormat) =>
  `${value > 0 ? "+" : ""}${formatter.format(value)}`;

export function populationBandRange(population: number, formatter: Intl.NumberFormat) {
  const limits = [1_000, 2_500, 5_000, 10_000, 20_000, 50_000];
  const band = municipalityPopulationBand(population);
  const minimum = band === 1 ? 0 : limits[band - 2];
  const maximum = limits[band - 1] ?? null;
  if (maximum === null) return "≥ " + formatter.format(minimum);
  if (minimum === 0) return "< " + formatter.format(maximum);
  return formatter.format(minimum) + "–" + formatter.format(maximum - 1);
}

export const COST_CATEGORY_IDS: readonly CostTargetId[] = COST_CATEGORIES.map(({ id }) => id);
/** Keeps a URL parameter inside the list its Datenart allows, falling back to the first. */
export const allow = <T extends string>(value: string, allowed: readonly T[]): T =>
  (allowed as readonly string[]).includes(value) ? value as T : allowed[0];
/** Narrows a full label record to the entries the current Datenart offers. */
export const pick = <K extends string>(labels: Record<K, string>, ids: readonly K[]): Partial<Record<K, string>> =>
  Object.fromEntries(ids.map((id) => [id, labels[id]])) as Partial<Record<K, string>>;
