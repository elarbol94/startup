import type { MunicipalityAnalysisData } from "./analysis";
import { median, municipalityCostPerCapita, municipalityPopulationBand, type CostTargetId } from "./costs";
export function createPeerMedianIndex(data: MunicipalityAnalysisData) {
  const cache = new Map<string, Map<string, number | null>>();
  return (code: string, year: number, category: CostTargetId) => {
    const cacheKey = `${category}|${year}`;
    let medians = cache.get(cacheKey);
    if (!medians) {
      const groups = new Map<string, number[]>();
      const yearCosts = data.costs?.years[String(year)]?.values ?? {};
      const populations = data.population.years[String(year)]?.values ?? {};
      for (const municipality of data.index.municipalities) {
        const inhabitants = populations[municipality.municipalityCode];
        const tuple = yearCosts[municipality.municipalityCode];
        if (!tuple || !inhabitants) continue;
        const value = municipalityCostPerCapita(tuple, category, inhabitants);
        if (value === null) continue;
        const band = municipalityPopulationBand(inhabitants);
        for (const key of [`${municipality.state}|${band}`, `*|${band}`]) {
          const group = groups.get(key);
          if (group) group.push(value);
          else groups.set(key, [value]);
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

