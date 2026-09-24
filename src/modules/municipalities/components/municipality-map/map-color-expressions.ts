// Fill-colour expressions and colour ramps for every map metric (shared by the layer paint and the legend).
// Used by municipality-map.tsx, use-municipality-map-instance.ts and municipality-map.test.ts (via re-export).
import type { ExpressionSpecification } from "maplibre-gl";
import type { CostMeasureId } from "../../costs";
import {
  DIGITAL_PLATFORM_PROVIDER_CATEGORIES,
  DIGITAL_PLATFORM_PROVIDER_CODES,
  type DigitalPlatformViewId,
} from "../../digital-platforms";
import type { MapMetric } from "../../demography";
import type { MovementPalette } from "../../movement";
import type { PoliticsView } from "../../politics";
import {
  MAP_NO_DATA_COLOR,
  MUNICIPALITY_COST_COLORS,
  MUNICIPALITY_DIVERGING_COLORS,
  MUNICIPALITY_DIVERGING_STOPS,
  MUNICIPALITY_MOVEMENT_COLORS,
  MUNICIPALITY_SEQUENTIAL_COLORS,
  POLITICS_PARTY_COLORS,
} from "../../palette";
import { DIGITAL_PLATFORM_PROVIDER_COLORS } from "../../provider-colors";
import { POPULATION_CLASSES } from "../../population";

const POPULATION_COLOR: ExpressionSpecification = [
  "step",
  ["coalesce", ["feature-state", "metric"], -1],
  MAP_NO_DATA_COLOR,
  ...POPULATION_CLASSES.flatMap(({ minimum, color }) => [minimum, color]),
] as ExpressionSpecification;
export const AGE_COLORS = [...MUNICIPALITY_SEQUENTIAL_COLORS];
export const MOVEMENT_COLORS = [...MUNICIPALITY_MOVEMENT_COLORS];
export const COST_COLORS = [...MUNICIPALITY_COST_COLORS];
export const DIGITAL_PLATFORM_COLORS = ["#f1f5f9", "#d1fae5", "#86efac", "#22c55e", "#15803d", "#14532d"];
function sequentialColorExpression(
  domain: [number, number],
  colors: string[],
): ExpressionSpecification {
  const [minimum, maximum] = domain;
  const value: ExpressionSpecification = [
    "max",
    minimum,
    ["min", maximum, ["feature-state", "metric"]],
  ];
  return [
    "case",
    ["boolean", ["feature-state", "hasMetric"], false],
    [
      "interpolate",
      ["linear"],
      value,
      minimum,
      colors[0],
      minimum + (maximum - minimum) * 0.2,
      colors[1],
      minimum + (maximum - minimum) * 0.4,
      colors[2],
      minimum + (maximum - minimum) * 0.6,
      colors[3],
      minimum + (maximum - minimum) * 0.8,
      colors[4],
      maximum,
      colors[5],
    ],
    MAP_NO_DATA_COLOR,
  ];
}
/** Ascending [value, colour] stops for a diverging scale of ±`maximum`. */
export function divergingColorStops(maximum: number) {
  const middle = (MUNICIPALITY_DIVERGING_COLORS.length - 1) / 2;
  return [
    ...MUNICIPALITY_DIVERGING_STOPS.map((fraction, index) => ({
      value: -fraction * maximum,
      color: MUNICIPALITY_DIVERGING_COLORS[middle - 1 - index],
      offset: (1 - fraction) / 2,
    })).reverse(),
    { value: 0, color: MUNICIPALITY_DIVERGING_COLORS[middle], offset: 0.5 },
    ...MUNICIPALITY_DIVERGING_STOPS.map((fraction, index) => ({
      value: fraction * maximum,
      color: MUNICIPALITY_DIVERGING_COLORS[middle + 1 + index],
      offset: (1 + fraction) / 2,
    })),
  ];
}
export type ColorInputs = {
  usePopulationClasses: boolean;
  scaleDomain: [number, number] | null;
  metric: MapMetric;
  movementPalette: MovementPalette | null;
  costMeasure: CostMeasureId;
  politicsView?: PoliticsView;
  digitalView?: DigitalPlatformViewId;
};
const POLITICS_LEADING_COLOR: ExpressionSpecification = [
  "match", ["feature-state", "metric"],
  0, POLITICS_PARTY_COLORS.oevp, 1, POLITICS_PARTY_COLORS.spoe, 2, POLITICS_PARTY_COLORS.fpoe,
  3, POLITICS_PARTY_COLORS.gruene, 4, POLITICS_PARTY_COLORS.neos, 5, POLITICS_PARTY_COLORS.kpoe,
  6, POLITICS_PARTY_COLORS.mfg, 7, POLITICS_PARTY_COLORS["local-other"], 8, POLITICS_PARTY_COLORS.tie,
  MAP_NO_DATA_COLOR,
] as ExpressionSpecification;
const DIGITAL_PLATFORM_COLOR: ExpressionSpecification = [
  "case",
  ["boolean", ["feature-state", "hasMetric"], false],
  [
    "step", ["feature-state", "metric"],
    DIGITAL_PLATFORM_COLORS[0],
    1, DIGITAL_PLATFORM_COLORS[1],
    2, DIGITAL_PLATFORM_COLORS[2],
    3, DIGITAL_PLATFORM_COLORS[3],
    5, DIGITAL_PLATFORM_COLORS[4],
    8, DIGITAL_PLATFORM_COLORS[5],
  ],
  MAP_NO_DATA_COLOR,
] as ExpressionSpecification;
const DIGITAL_PLATFORM_PROVIDER_COLOR: ExpressionSpecification = [
  "match", ["feature-state", "metric"],
  ...DIGITAL_PLATFORM_PROVIDER_CATEGORIES.flatMap((category) => [
    DIGITAL_PLATFORM_PROVIDER_CODES[category],
    DIGITAL_PLATFORM_PROVIDER_COLORS[category],
  ]),
  MAP_NO_DATA_COLOR,
] as ExpressionSpecification;
/**
 * The fill colour for the current metric.
 *
 * Shared by the layer's initial paint and every later update: creating the layer with
 * the population ramp and fixing it in an effect left a visible window where a
 * movement or cost map was painted with population class breaks.
 */
export function metricColorExpression({
  usePopulationClasses, scaleDomain, metric, movementPalette, costMeasure,
  politicsView = "leading-list", digitalView = "overview",
}: ColorInputs): ExpressionSpecification {
  if (metric === "politics" && politicsView === "leading-list") return POLITICS_LEADING_COLOR;
  if (metric === "digital" && digitalView === "providers") return DIGITAL_PLATFORM_PROVIDER_COLOR;
  if (metric === "digital") return DIGITAL_PLATFORM_COLOR;
  if (usePopulationClasses || !scaleDomain) return POPULATION_COLOR;
  if (metric === "movement") {
    return movementPalette === "diverging"
      ? divergingColorExpression(scaleDomain)
      : sequentialColorExpression(scaleDomain, MOVEMENT_COLORS);
  }
  if (metric === "costs") {
    return costMeasure === "peer-deviation"
      ? divergingColorExpression(scaleDomain)
      : sequentialColorExpression(scaleDomain, COST_COLORS);
  }
  return sequentialColorExpression(scaleDomain, AGE_COLORS);
}
function divergingColorExpression(
  domain: [number, number],
): ExpressionSpecification {
  const maximum = Math.max(Math.abs(domain[0]), Math.abs(domain[1]));
  const value: ExpressionSpecification = [
    "max",
    -maximum,
    ["min", maximum, ["feature-state", "metric"]],
  ];
  // Stops follow the observed quantiles instead of even spacing — see
  // MUNICIPALITY_DIVERGING_STOPS for why linear spacing left most of Austria white.
  const stops = divergingColorStops(maximum);
  return [
    "case",
    ["boolean", ["feature-state", "hasMetric"], false],
    [
      "interpolate",
      ["linear"],
      value,
      ...stops.flatMap(({ value: stop, color }) => [stop, color]),
    ] as ExpressionSpecification,
    MAP_NO_DATA_COLOR,
  ];
}
