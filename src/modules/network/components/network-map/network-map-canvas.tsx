"use client";

// The network map itself: the shared municipality canvas coloured by the chosen mode, with circles
// for people, lines to connected municipalities, the colour switch and legend. Pulls in MapLibre,
// so network-map-view.tsx loads it with next/dynamic.
import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Crosshair } from "lucide-react";
import { sequentialColorExpression } from "@/modules/municipalities/components/municipality-map/map-color-expressions";
import type { MapLine, MapMarker } from "@/modules/municipalities/components/municipality-map/map-types";
import { MunicipalityMapCanvas } from "@/modules/municipalities/components/municipality-map/municipality-map-canvas";
import type { MunicipalityBounds } from "@/modules/municipalities/data";
import { MAP_NO_DATA_COLOR } from "@/modules/municipalities/palette";
import { contactClosenessLevels } from "../../constants";
import { networkMapColorModes, networkMapValue, type NetworkMapColorMode, type NetworkMapMunicipality } from "../../network-map";
import { selectClassName } from "../network-ui";
import { rampColors } from "./network-map-utils";

type Props = {
  austriaBounds: MunicipalityBounds;
  summaryByCode: Map<string, NetworkMapMunicipality>;
  mode: NetworkMapColorMode;
  onModeChange: (mode: NetworkMapColorMode) => void;
  today: string;
  selectedCode: string;
  onSelect: (code: string) => void;
  values: Record<string, number | null>;
  domain: [number, number];
  markers: MapMarker[];
  lines: MapLine[];
  highlightCodes: string[] | null;
  focusBounds: MunicipalityBounds | null;
  onFitNetwork: (() => void) | null;
};

/** Mean closeness (1–3) → the nearest level's name. */
function closenessLevel(value: number) {
  // contactClosenessLevels runs close → loose, scores run loose 1 → close 3.
  return contactClosenessLevels[3 - Math.min(3, Math.max(1, Math.round(value)))];
}

export function NetworkMapCanvas({
  austriaBounds, summaryByCode, mode, onModeChange, today, selectedCode, onSelect, values, domain, markers, lines,
  highlightCodes, focusBounds, onFitNetwork,
}: Props) {
  const t = useTranslations("network");
  const tm = useTranslations("municipalities");
  const locale = useLocale();
  const numbers = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale]);
  const colors = rampColors(mode);
  const fillColor = useMemo(() => sequentialColorExpression(domain, rampColors(mode)), [domain, mode]);
  const labels = {
    map: tm("mapLabel"),
    zoomIn: tm("zoomIn"),
    zoomOut: tm("zoomOut"),
    reset: tm("allAustria"),
    municipalityCode: tm("municipalityCode"),
    zoomHintWindows: tm("mapZoomHintWindows"),
    zoomHintMac: tm("mapZoomHintMac"),
    zoomHintMobile: tm("mapZoomHintMobile"),
  };

  const valueText = (value: number) =>
    mode === "closeness" ? t(`closeness.${closenessLevel(value)}`)
    : mode === "recency" ? t("map.legendDays", { days: value })
    : numbers.format(value);

  const tooltipLines = (code: string) => {
    const municipality = summaryByCode.get(code);
    if (!municipality) return [];
    const counts = [t("map.tooltip.people", { count: municipality.personIds.length })];
    if (municipality.organizationIds.length) counts.push(t("map.tooltip.organizations", { count: municipality.organizationIds.length }));
    const lines = [counts.join(" · ")];
    if (mode === "people" || !municipality.personIds.length) return lines;
    const value = networkMapValue(municipality, mode, today);
    if (mode === "closeness") { if (value !== null) lines.push(t("map.tooltip.closeness", { value: valueText(value) })); }
    else if (mode === "recency") lines.push(value === null ? t("map.tooltip.never") : t("map.tooltip.recency", { days: value }));
    else lines.push(t(`map.tooltip.${mode}`, { count: value ?? 0 }));
    return lines;
  };

  return (
    <MunicipalityMapCanvas
      testId="network-map"
      austriaBounds={austriaBounds}
      selected={selectedCode ? { municipalityCode: selectedCode } : null}
      onSelect={onSelect}
      onReset={() => onSelect("")}
      values={values}
      fillColor={fillColor}
      tooltipLines={tooltipLines}
      highlightCodes={highlightCodes}
      labels={labels}
      markers={markers}
      lines={lines}
      focusBounds={focusBounds}
      controls={onFitNetwork && (
        <button
          type="button"
          className="flex min-h-11 items-center justify-center gap-1 border-t px-2 py-2 text-[10px] font-semibold whitespace-nowrap hover:bg-accent lg:min-h-0"
          aria-label={t("map.fitNetworkLabel")}
          title={t("map.fitNetworkLabel")}
          onClick={onFitNetwork}
        >
          <Crosshair className="size-3" aria-hidden="true" />
          {t("map.fitNetwork")}
        </button>
      )}
    >
      <div className="absolute top-3 left-3 z-10 w-60 max-w-[calc(100%-5rem)] space-y-2 rounded-xl border bg-background/95 p-3 text-xs shadow-sm backdrop-blur">
        <label className="block space-y-1">
          <span className="font-semibold">{t("map.colorBy")}</span>
          <select
            className={selectClassName}
            value={mode}
            onChange={(event) => onModeChange(event.target.value as NetworkMapColorMode)}
            data-testid="network-map-color"
          >
            {networkMapColorModes.map((value) => <option key={value} value={value}>{t(`map.colorModes.${value}`)}</option>)}
          </select>
        </label>
        <div>
          <div className="h-2 rounded-full" style={{ background: `linear-gradient(to right, ${colors.join(",")})` }} aria-hidden="true" />
          <div className="mt-1 flex justify-between text-muted-foreground">
            <span>{valueText(domain[0])}</span>
            <span>{valueText(domain[1])}</span>
          </div>
        </div>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <span className="size-2.5 rounded-sm opacity-60" style={{ background: MAP_NO_DATA_COLOR }} aria-hidden="true" />
          {t("map.legendNoData")}
        </p>
        <p className="hidden text-muted-foreground sm:block">{t("map.legendCircles")}</p>
      </div>
    </MunicipalityMapCanvas>
  );
}
