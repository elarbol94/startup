import type { MunicipalityAnalysisData } from "./analysis";
import { median, municipalityCostPerCapita, municipalityPopulationBand, type CostTargetId } from "./costs";

/**
 * Median per-capita value of a Gemeinde's comparison group: same population band in the
 * same Bundesland, or nationwide when the Bundesland has fewer than five. `perCapita`
 * reads one Gemeinde's value for `key`, so costs and income share one definition.
 */
export function createBandMedianIndex<Key extends string>(
  data: Pick<MunicipalityAnalysisData, "index" | "population">,
  perCapita: (code: string, year: number, inhabitants: number, key: Key) => number | null,
) {
  const cache = new Map<string, Map<string, number | null>>();
  return (code: string, year: number, key: Key) => {
    const cacheKey = `${key}|${year}`;
    let medians = cache.get(cacheKey);
    if (!medians) {
      const groups = new Map<string, number[]>();
      const populations = data.population.years[String(year)]?.values ?? {};
      for (const municipality of data.index.municipalities) {
        const inhabitants = populations[municipality.municipalityCode];
        if (!inhabitants) continue;
        const value = perCapita(municipality.municipalityCode, year, inhabitants, key);
        if (value === null) continue;
        const band = municipalityPopulationBand(inhabitants);
        for (const groupKey of [`${municipality.state}|${band}`, `*|${band}`]) {
          const group = groups.get(groupKey);
          if (group) group.push(value);
          else groups.set(groupKey, [value]);
        }
      }
      medians = new Map();
      for (const municipality of data.index.municipalities) {
        const band = municipalityPopulationBand(populations[municipality.municipalityCode]);
        const regional = groups.get(`${municipality.state}|${band}`);
        // Fewer than five neighbours in the same Bundesland is too thin a comparison,
        // so those fall back to the nationwide band.
        const comparison = regional && regional.length >= 5 ? regional : groups.get(`*|${band}`) ?? [];
        medians.set(municipality.municipalityCode, median(comparison));
      }
      cache.set(cacheKey, medians);
    }
    return medians.get(code) ?? null;
  };
}

export function createPeerMedianIndex(data: MunicipalityAnalysisData) {
  return createBandMedianIndex<CostTargetId>(data, (code, year, inhabitants, category) => {
    const tuple = data.costs?.years[String(year)]?.values[code];
    return tuple ? municipalityCostPerCapita(tuple, category, inhabitants) : null;
  });
}
