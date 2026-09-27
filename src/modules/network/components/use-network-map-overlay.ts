"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { MunicipalityIndexItem } from "@/modules/municipalities/data";
import type { MapMarker } from "@/modules/municipalities/components/municipality-map/map-types";
import { getNetworkMapCounts } from "../municipality-actions";
import type { MunicipalityContactCount } from "../municipality-queries";

/**
 * The municipality map's "Kontakte" overlay: one circle per municipality where
 * the network knows people (living there or at an organisation there), counting
 * only contacts the viewer may see. Loads when switched on.
 */
export function useNetworkMapOverlay(active: boolean, municipalities: MunicipalityIndexItem[] | null) {
  const t = useTranslations("network");
  const [counts, setCounts] = useState<MunicipalityContactCount[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    // Refetched on every switch-on, so contacts added meanwhile show up.
    getNetworkMapCounts()
      .then((result) => { if (!cancelled) { setCounts(result); setFailed(false); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [active]);

  return useMemo(() => {
    if (!active || !counts || !municipalities) {
      return { markers: active ? [] : null, markerTooltips: null, loading: active && !counts && !failed, failed };
    }
    const byCode = new Map(municipalities.map((municipality) => [municipality.municipalityCode, municipality]));
    const markers: MapMarker[] = [];
    const markerTooltips: Record<string, string> = {};
    for (const count of counts) {
      const municipality = byCode.get(count.code);
      if (!municipality || count.total === 0) continue;
      const [west, south, east, north] = municipality.bounds;
      markers.push({ code: count.code, lng: (west + east) / 2, lat: (south + north) / 2, count: count.total });
      markerTooltips[count.code] = t("mapOverlay.tooltip", count);
    }
    return { markers, markerTooltips, loading: false, failed };
  }, [active, counts, failed, municipalities, t]);
}
