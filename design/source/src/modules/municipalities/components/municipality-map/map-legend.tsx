// Colour legends of the municipality map: the desktop overlay and the mobile legend sheet content.
// Used by municipality-map.tsx.
import type { MapMetric } from "../../demography";
import { CANONICAL_PARTIES, type PoliticsView } from "../../politics";
import {
  MAP_NO_DATA_COLOR,
  MAP_NO_DATA_OPACITY,
  POLITICS_PARTY_COLORS,
} from "../../palette";
import { POPULATION_CLASSES } from "../../population";
import type { Labels } from "./map-types";

export type MapLegendProps = {
  metric: MapMetric;
  metricLabel: string;
  labels: Labels;
  politicsView: PoliticsView;
  usePopulationClasses: boolean;
  scaleDomain: [number, number] | null;
  personsFormatter: Intl.NumberFormat;
  chartValueFormatter: Intl.NumberFormat;
  chartUnitLabel: string;
  isDiverging: boolean;
  legendGradient: string;
  digitalLegendItems: Array<[string, string]>;
};

function populationClassLabel(
  item: (typeof POPULATION_CLASSES)[number],
  formatter: Intl.NumberFormat,
) {
  if (item.maximum === null) return `≥ ${formatter.format(item.minimum)}`;
  if (item.minimum === 0) return `< ${formatter.format(item.maximum + 1)}`;
  return `${formatter.format(item.minimum)}–${formatter.format(item.maximum)}`;
}

export function MapLegend({
  metric, metricLabel, labels, politicsView, usePopulationClasses, scaleDomain, personsFormatter,
  chartValueFormatter, chartUnitLabel, isDiverging, legendGradient, digitalLegendItems,
}: MapLegendProps) {
  return (
    <div
      className="absolute bottom-3 left-3 z-10 hidden w-44 max-w-[calc(100%-1.5rem)] rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur lg:block"
      data-testid="population-legend"
    >
      <p className="text-xs font-semibold">{metricLabel}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        {labels.reference}
      </p>
      {metric === "digital" ? (
        <ul className="mt-2 space-y-1" aria-label={metricLabel}>
          {digitalLegendItems.map(([color, label]) => <li key={label} className="flex items-center gap-2 text-[10px]"><span className="size-3 rounded-[3px] border border-black/10" style={{ backgroundColor: color }} /><span>{label}</span></li>)}
        </ul>
      ) : metric === "politics" && politicsView === "leading-list" ? (
        <ul className="mt-2 space-y-1" aria-label={metricLabel}>
          {[...CANONICAL_PARTIES, "tie" as const].map((party) => <li key={party} className="flex items-center gap-2 text-[10px]"><span className="size-3 rounded-[3px] border border-black/10" style={{ backgroundColor: POLITICS_PARTY_COLORS[party] }} /><span>{party === "tie" ? labels.politicsTie : labels.politicsParties[party]}</span></li>)}
        </ul>
      ) : usePopulationClasses ? (
        <ul className="mt-2 space-y-1" aria-label={metricLabel}>
          {POPULATION_CLASSES.map((item) => (
            <li
              key={item.minimum}
              className="flex items-center gap-2 text-[10px] tabular-nums"
            >
              <span
                className="size-3 rounded-[3px] border border-black/10"
                style={{ backgroundColor: item.color }}
              />
              <span>{populationClassLabel(item, personsFormatter)}</span>
            </li>
          ))}
        </ul>
      ) : (
        scaleDomain && (
          <>
            <div className="relative mt-2">
              <div
                className="h-3 rounded-sm border border-black/10"
                style={{ background: `linear-gradient(to right, ${legendGradient})` }}
              />
              {isDiverging && (
                <span
                  className="absolute -top-0.5 h-4 w-px bg-foreground/60"
                  style={{ left: "50%" }}
                  data-testid="legend-zero-marker"
                />
              )}
            </div>
            {/* The scale ends at the 95th percentile, so anything above shares the last
                colour. Saying "≥" keeps the bar from claiming a range the fills exceed;
                a diverging scale clips at both ends and gets "≤" as well. */}
            <div className="mt-1 flex justify-between gap-2 text-[9px] tabular-nums">
              <span>{isDiverging ? "≤ " : ""}{chartValueFormatter.format(scaleDomain[0])}</span>
              {isDiverging && <span className="text-muted-foreground">0</span>}
              <span>≥ {chartValueFormatter.format(scaleDomain[1])}</span>
            </div>
            {chartUnitLabel && (
              <p className="mt-1 text-[9px] text-muted-foreground">
                {chartUnitLabel}
              </p>
            )}
          </>
        )
      )}
      <p className="mt-2 flex items-center gap-2 border-t pt-2 text-[10px] text-muted-foreground">
        <span
          className="size-3 rounded-[3px] border border-black/10"
          style={{ backgroundColor: MAP_NO_DATA_COLOR, opacity: MAP_NO_DATA_OPACITY }}
        />
        {labels.noData}
      </p>
    </div>
  );
}

export function MobileMapLegend({
  metric, metricLabel, labels, politicsView, usePopulationClasses, scaleDomain, personsFormatter,
  chartValueFormatter, chartUnitLabel, isDiverging, legendGradient, digitalLegendItems,
}: MapLegendProps) {
  return (
    <div data-testid="mobile-population-legend">
      <p className="text-sm font-semibold">{metricLabel}</p>
      {metric === "digital" ? (
        <ul className="mt-3 grid grid-cols-2 gap-2" aria-label={metricLabel}>
          {digitalLegendItems.map(([color, label]) => <li key={label} className="flex items-center gap-2 text-xs"><span className="size-4 rounded-[3px] border border-black/10" style={{ backgroundColor: color }} /><span>{label}</span></li>)}
        </ul>
      ) : metric === "politics" && politicsView === "leading-list" ? (
        <ul className="mt-3 grid grid-cols-2 gap-2" aria-label={metricLabel}>
          {[...CANONICAL_PARTIES, "tie" as const].map((party) => <li key={party} className="flex items-center gap-2 text-xs"><span className="size-4 rounded-[3px] border border-black/10" style={{ backgroundColor: POLITICS_PARTY_COLORS[party] }} /><span>{party === "tie" ? labels.politicsTie : labels.politicsParties[party]}</span></li>)}
        </ul>
      ) : usePopulationClasses ? (
        <ul className="mt-3 grid grid-cols-2 gap-2" aria-label={metricLabel}>
          {POPULATION_CLASSES.map((item) => (
            <li key={item.minimum} className="flex items-center gap-2 text-xs tabular-nums">
              <span className="size-4 rounded-[3px] border border-black/10" style={{ backgroundColor: item.color }} />
              <span>{populationClassLabel(item, personsFormatter)}</span>
            </li>
          ))}
        </ul>
      ) : scaleDomain ? (
        <>
          <div className="relative mt-4">
            <div className="h-5 rounded-sm border border-black/10" style={{ background: `linear-gradient(to right, ${legendGradient})` }} />
            {isDiverging ? <span className="absolute -top-0.5 h-6 w-px bg-foreground/60" style={{ left: "50%" }} /> : null}
          </div>
          <div className="mt-2 flex justify-between gap-2 text-xs tabular-nums">
            <span>{isDiverging ? "≤ " : ""}{chartValueFormatter.format(scaleDomain[0])}</span>
            {isDiverging ? <span className="text-muted-foreground">0</span> : null}
            <span>≥ {chartValueFormatter.format(scaleDomain[1])}</span>
          </div>
          {chartUnitLabel ? <p className="mt-1 text-xs text-muted-foreground">{chartUnitLabel}</p> : null}
        </>
      ) : null}
      <p className="mt-4 flex items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
        <span className="size-4 rounded-[3px] border border-black/10" style={{ backgroundColor: MAP_NO_DATA_COLOR, opacity: MAP_NO_DATA_OPACITY }} />
        {labels.noData}
      </p>
    </div>
  );
}
