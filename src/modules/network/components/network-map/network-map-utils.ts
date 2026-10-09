// Turns the network map summary into what the map draws: fill values, circles, lines and the
// area to zoom to. Pure; used by network-map-view.tsx and the files in network-map/.
import { mergeBounds, type MunicipalityBounds, type MunicipalityIndexItem } from "@/modules/municipalities/data";
import type { MapLine, MapMarker } from "@/modules/municipalities/components/municipality-map/map-types";
import { MUNICIPALITY_SEQUENTIAL_COLORS } from "@/modules/municipalities/palette";
import {
  networkMapDomain,
  networkMapValue,
  type NetworkMapColorMode,
  type NetworkMapConnection,
  type NetworkMapMunicipality,
} from "../../network-map";

/** The middle of a municipality's bounding box, as in the Gemeinde map's contact overlay. */
export function municipalityCenter(bounds: MunicipalityBounds): [number, number] {
  const [west, south, east, north] = bounds;
  return [(west + east) / 2, (south + north) / 2];
}

/** Low → high colours. For "last contact" more days is worse, so recent contact is the dark end. */
export function rampColors(mode: NetworkMapColorMode): string[] {
  const colors = [...MUNICIPALITY_SEQUENTIAL_COLORS];
  return mode === "recency" ? colors.reverse() : colors;
}

export function buildNetworkMapLayers(
  summary: NetworkMapMunicipality[],
  mode: NetworkMapColorMode,
  today: string,
  byCode: Map<string, MunicipalityIndexItem>,
) {
  const values: Record<string, number | null> = {};
  const markers: MapMarker[] = [];
  for (const municipality of summary) {
    const item = byCode.get(municipality.code);
    if (!item) continue;
    values[municipality.code] = networkMapValue(municipality, mode, today);
    const [lng, lat] = municipalityCenter(item.bounds);
    const people = municipality.personIds.length;
    markers.push({ code: municipality.code, lng, lat, count: Math.max(people, 1), hollow: people === 0 });
  }
  return { values, markers, domain: networkMapDomain(mode, Object.values(values)) };
}

/** Lines from the selected municipality to each connected one. */
export function connectionLines(
  selectedCode: string,
  connections: NetworkMapConnection[],
  byCode: Map<string, MunicipalityIndexItem>,
): MapLine[] {
  const selected = byCode.get(selectedCode);
  if (!selected) return [];
  const from = municipalityCenter(selected.bounds);
  return connections.flatMap((connection) => {
    const target = byCode.get(connection.code);
    return target ? [{ from, to: municipalityCenter(target.bounds), emphasis: connection.introductions > 0 && connection.people === 0 }] : [];
  });
}

/** The area that holds the whole (filtered) network, or null when nothing is on the map. */
export function networkBounds(summary: NetworkMapMunicipality[], byCode: Map<string, MunicipalityIndexItem>) {
  const bounds = summary.flatMap((municipality) => {
    const item = byCode.get(municipality.code);
    return item ? [item.bounds] : [];
  });
  return bounds.length ? mergeBounds(bounds) : null;
}

/**
 * Municipalities with people, highest value first, for the overview list. For "last contact"
 * that puts the longest-neglected places first, which is where to act.
 */
export function topMunicipalities(summary: NetworkMapMunicipality[], values: Record<string, number | null>, limit = 8) {
  return summary
    .filter((municipality) => municipality.personIds.length > 0 && values[municipality.code] != null)
    .sort((a, b) => (values[b.code] ?? 0) - (values[a.code] ?? 0) || b.personIds.length - a.personIds.length)
    .slice(0, limit)
    .map((municipality) => municipality.code);
}
