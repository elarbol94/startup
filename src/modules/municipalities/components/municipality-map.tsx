"use client";

import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { Info, ListFilter, MapPinned, SlidersHorizontal, X } from "lucide-react";
import { DIGITAL_PLATFORM_PROVIDER_CATEGORIES } from "../digital-platforms";
import { DIGITAL_PLATFORM_PROVIDER_COLORS } from "../provider-colors";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { MunicipalityMetricChart } from "./municipality-metric-chart";
import {
  AGE_COLORS,
  COST_COLORS,
  DIGITAL_PLATFORM_COLORS,
  divergingColorStops,
  metricColorExpression,
  MOVEMENT_COLORS,
} from "./municipality-map/map-color-expressions";
import { MapLegend, MobileMapLegend, type MapLegendProps } from "./municipality-map/map-legend";
import { MapMetricControls } from "./municipality-map/map-metric-controls";
import { MobileMetricControls } from "./municipality-map/map-mobile-metric-controls";
import type { MapMetricControlsProps, MunicipalityMapProps } from "./municipality-map/map-types";
import { MunicipalityMapCanvas } from "./municipality-map/municipality-map-canvas";
import { cn } from "@/lib/utils";

export {
  DIGITAL_PLATFORM_COLORS,
  divergingColorStops,
  metricColorExpression,
} from "./municipality-map/map-color-expressions";
export { DIGITAL_PLATFORM_PROVIDER_COLORS } from "../provider-colors";

export function MunicipalityMap({
  austriaBounds,
  selected,
  metric,
  populationView,
  populationDefinition,
  usePopulationClasses,
  metricValues,
  tooltipValues,
  scaleDomain,
  movementPalette,
  year,
  firstYear,
  latestYear,
  ageView,
  dataKind,
  sex,
  movementView,
  costCategory,
  costMeasure,
  politicsView,
  politicsParty,
  digitalView,
  customView,
  peerMunicipalityCodes,
  peerGroupLabel,
  movementDefinition,
  showAgeFilters,
  indicatorDefinition,
  ageLoading,
  ageError,
  movementLoading,
  movementError,
  costsLoading,
  costsError,
  politicsLoading,
  politicsError,
  digitalLoading,
  digitalError,
  structureLoading,
  structureError,
  onYearChange,
  onMetricChange,
  onPopulationViewChange,
  onAgeViewChange,
  onDataKindChange,
  onSexChange,
  onMovementViewChange,
  onCostCategoryChange,
  onCostMeasureChange,
  onPoliticsViewChange,
  onPoliticsPartyChange,
  onDigitalViewChange,
  onCustomViewChange,
  onCustomDelete,
  onSelect,
  onReset,
  onOpenDetails,
  labels,
  selectedMetricHistory,
  metricChartLabel,
  metricLabel,
  chartValueFormatter,
  chartUnitLabel,
  chartChangeLabels,
  analysisDataset,
  showMetricChart,
  markers,
  markerTooltips,
  overlayToggle,
}: MunicipalityMapProps) {
  const locale = useLocale();
  const personsFormatter = useMemo(
    () => new Intl.NumberFormat(locale),
    [locale],
  );
  const fillColor = useMemo(
    () => metricColorExpression({
      usePopulationClasses, scaleDomain, metric, movementPalette, costMeasure, politicsView, digitalView,
    }),
    [costMeasure, digitalView, metric, movementPalette, politicsView, scaleDomain, usePopulationClasses],
  );
  const tooltipLines = (code: string) => {
    const value = tooltipValues
      ? (tooltipValues[code] ?? "—")
      : `${labels.population}: ${personsFormatter.format(metricValues[code] ?? 0)}`;
    const overlayLine = markers ? markerTooltips?.[code] : undefined;
    return overlayLine ? [value, overlayLine] : [value];
  };
  const [mobilePanel, setMobilePanel] = useState<"display" | "legend" | null>(null);

  const isDiverging =
    (metric === "movement" && movementPalette === "diverging") ||
    (metric === "costs" && costMeasure === "peer-deviation");
  // The bar has to carry the same non-linear stops as the map, otherwise it reports a
  // value range the fills never use.
  const legendGradient = isDiverging
    ? divergingColorStops(1)
        .map(({ color, offset }) => `${color} ${(offset * 100).toFixed(1)}%`)
        .join(",")
    : (metric === "movement" ? MOVEMENT_COLORS : metric === "costs" ? COST_COLORS : AGE_COLORS).join(",");
  const digitalLegendItems: Array<[string, string]> = digitalView === "providers"
    ? DIGITAL_PLATFORM_PROVIDER_CATEGORIES.map((category) => [
        DIGITAL_PLATFORM_PROVIDER_COLORS[category],
        labels.digitalProviderLabels[category],
      ])
    : [
        [DIGITAL_PLATFORM_COLORS[0], labels.digitalNoneFound],
        [DIGITAL_PLATFORM_COLORS[1], labels.digitalLegendOne],
        [DIGITAL_PLATFORM_COLORS[2], labels.digitalLegendTwo],
        [DIGITAL_PLATFORM_COLORS[3], labels.digitalLegendThreeToFour],
        [DIGITAL_PLATFORM_COLORS[4], labels.digitalLegendFiveToSeven],
        [DIGITAL_PLATFORM_COLORS[5], labels.digitalLegendEightPlus],
      ];
  const metricControlProps: MapMetricControlsProps = {
    labels, dataKind, metric, populationView, populationDefinition, structureLoading,
    structureError, ageView, showAgeFilters, sex, indicatorDefinition, ageLoading, ageError,
    movementView, movementDefinition, movementLoading, movementError, politicsView, politicsParty,
    politicsLoading, politicsError, customView, digitalView, digitalLoading, digitalError,
    costMeasure, costCategory, costsLoading, costsError, peerGroupLabel, year, firstYear,
    latestYear, onDataKindChange, onMetricChange, onPopulationViewChange, onAgeViewChange,
    onSexChange, onMovementViewChange, onPoliticsViewChange, onPoliticsPartyChange,
    onCustomViewChange, onCustomDelete, onDigitalViewChange, onCostMeasureChange,
    onCostCategoryChange, onYearChange,
  };
  const legendProps: MapLegendProps = {
    metric, metricLabel, labels, politicsView, usePopulationClasses, scaleDomain, personsFormatter,
    chartValueFormatter, chartUnitLabel, isDiverging, legendGradient, digitalLegendItems,
  };
  return (
    <MunicipalityMapCanvas
      austriaBounds={austriaBounds}
      selected={selected}
      onSelect={onSelect}
      onReset={onReset}
      values={metricValues}
      fillColor={fillColor}
      tooltipLines={tooltipLines}
      highlightCodes={peerMunicipalityCodes}
      labels={labels}
      markers={markers}
      controls={overlayToggle && (
        <button
          type="button"
          className={cn(
            "flex min-h-11 items-center justify-center gap-1 border-t px-2 py-2 text-[10px] font-semibold whitespace-nowrap hover:bg-accent lg:min-h-0",
            overlayToggle.active && "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
          )}
          aria-pressed={overlayToggle.active}
          aria-busy={overlayToggle.loading || undefined}
          data-testid="map-overlay-toggle"
          onClick={overlayToggle.onToggle}
        >
          <span className={cn("size-2 rounded-full border border-indigo-600", overlayToggle.active && "bg-indigo-600")} aria-hidden="true" />
          {overlayToggle.label}
        </button>
      )}
    >
      {selected && selectedMetricHistory && showMetricChart && (
        <div className="hidden lg:block">
        <MunicipalityMetricChart
          metricLabel={metricLabel}
          municipalityName={selected.name}
          points={selectedMetricHistory}
          selectedYear={year}
          valueFormatter={chartValueFormatter}
          unitLabel={chartUnitLabel}
          changeLabels={chartChangeLabels}
          chartLabel={metricChartLabel}
          minimizeLabel={labels.minimizeChart}
          expandLabel={labels.expandChart}
          restoreLabel={labels.restoreChart}
          dataset={analysisDataset}
          addToAnalysisLabel={labels.addToAnalysis}
          dragToAnalysisLabel={labels.dragToAnalysis}
        />
        </div>
      )}
      <MapMetricControls {...metricControlProps} />
      <MapLegend {...legendProps} />

      {selected ? (
        <div className="absolute inset-x-3 bottom-[4.75rem] z-20 flex justify-center lg:hidden">
          <div className="flex max-w-full items-center overflow-hidden rounded-full border bg-background/95 shadow-lg backdrop-blur">
            <button
              type="button"
              className="flex min-h-11 min-w-0 items-center gap-2 px-4 text-left"
              onClick={onOpenDetails}
            >
              <MapPinned className="size-4 shrink-0 text-teal-700" />
              <span className="min-w-0 truncate text-sm font-semibold">{selected.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{labels.selected}</span>
            </button>
            <button
              type="button"
              className="grid size-11 shrink-0 place-items-center border-l hover:bg-accent"
              aria-label={labels.reset}
              onClick={onReset}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : null}

      <nav
        className="absolute inset-x-3 bottom-3 z-20 grid grid-cols-3 overflow-hidden rounded-xl border bg-background/95 shadow-xl backdrop-blur lg:hidden"
        aria-label={labels.map}
      >
        <button
          type="button"
          className="flex min-h-12 items-center justify-center gap-2 px-2 text-xs font-semibold hover:bg-accent"
          onClick={() => setMobilePanel("display")}
        >
          <SlidersHorizontal className="size-4" />
          {labels.display}
        </button>
        <button
          type="button"
          className="flex min-h-12 items-center justify-center gap-2 border-x px-2 text-xs font-semibold hover:bg-accent"
          onClick={() => setMobilePanel("legend")}
        >
          <ListFilter className="size-4" />
          {labels.legend}
        </button>
        <button
          type="button"
          className="flex min-h-12 items-center justify-center gap-2 px-2 text-xs font-semibold hover:bg-accent"
          onClick={onOpenDetails}
        >
          <Info className="size-4" />
          {labels.details}
        </button>
      </nav>

      <MobileBottomSheet
        open={mobilePanel === "display"}
        onOpenChange={(open) => setMobilePanel(open ? "display" : null)}
        title={labels.display}
        description={metricLabel}
        closeLabel={labels.close}
      >
        <MobileMetricControls {...metricControlProps} />
      </MobileBottomSheet>

      <MobileBottomSheet
        open={mobilePanel === "legend"}
        onOpenChange={(open) => setMobilePanel(open ? "legend" : null)}
        title={labels.legend}
        description={labels.reference}
        closeLabel={labels.close}
      >
        <MobileMapLegend {...legendProps} />
      </MobileBottomSheet>
    </MunicipalityMapCanvas>
  );
}
