"use client";

// Reads the workspace's map selection (Datenart, category, views, filters) from the URL search parameters.
// A pure read, shaped as a hook so the React Compiler treats the result as immutable. Used by municipalities-workspace.tsx.
import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  COST_TARGETS,
  isCostTargetId,
  isCostMeasureId,
  type CostMeasureId,
  type CostTargetId,
} from "../../costs";
import { isDigitalPlatformViewId, type DigitalPlatformViewId } from "../../digital-platforms";
import {
  isAgeGroupId,
  isDemographicIndicatorId,
  type AgeGroupId,
  type AgeMeasure,
  type AgeViewId,
  type DemographicIndicatorId,
  type MapMetric,
  type SexFilter,
} from "../../demography";
import { isMovementTargetId, type MovementTargetId } from "../../movement";
import {
  ageMeasureFor,
  AGE_VIEWS_BY_KIND,
  COST_MEASURES_BY_KIND,
  DIGITAL_VIEWS_BY_KIND,
  isDataKind,
  MAP_METRICS_BY_KIND,
  MOVEMENT_VIEWS_BY_KIND,
  POLITICS_VIEWS_BY_KIND,
  POPULATION_VIEWS_BY_KIND,
  type DataKind,
} from "../../kennzahlen";
import {
  isCanonicalPartyId,
  isPoliticsView,
  type CanonicalPartyId,
  type PoliticsView,
} from "../../politics";
import type { MunicipalityMetricRecord } from "../../queries";
import { isPopulationViewId, type PopulationViewId } from "../../structure";
import { allow, COST_CATEGORY_IDS } from "./workspace-utils";

export function useWorkspaceSelection(searchParams: ReadonlyURLSearchParams, metrics: MunicipalityMetricRecord[]) {
  // Datenart first: it decides which categories and which views the other two dropdowns
  // offer, so every selection below is coerced into the list its Datenart allows.
  const dataKind: DataKind = isDataKind(searchParams.get("dataKind")) ? searchParams.get("dataKind") as DataKind : "base";
  // "custom" is only on offer once the user has saved a Kennzahl of their own.
  const availableMetrics = MAP_METRICS_BY_KIND[dataKind].filter((item) => item !== "custom" || metrics.length > 0);
  const metric: MapMetric = allow(searchParams.get("metric") ?? "population", availableMetrics);
  const customMetricParameter = searchParams.get("customMetric") ?? "";
  const customMetric = metrics.find(({ id }) => id === customMetricParameter) ?? metrics[0] ?? null;
  const populationViewParameter = searchParams.get("populationView") ?? "";
  const populationView: PopulationViewId = allow(
    isPopulationViewId(populationViewParameter) ? populationViewParameter : "",
    POPULATION_VIEWS_BY_KIND[dataKind],
  );
  const ageViewParameter = searchParams.get("ageIndicator") || searchParams.get("ageGroup") || "";
  const ageView: AgeViewId = allow(ageViewParameter, AGE_VIEWS_BY_KIND[dataKind]);
  const indicator: DemographicIndicatorId | null = isDemographicIndicatorId(ageView) ? ageView : null;
  const ageGroup: AgeGroupId = isAgeGroupId(ageView) ? ageView : "0-5";
  const ageMeasure: AgeMeasure = ageMeasureFor(dataKind);
  const sexParameter = searchParams.get("sex");
  const sex: SexFilter =
    sexParameter === "female" || sexParameter === "male" ? sexParameter : "all";
  const movementParameter = searchParams.get("movementMetric") ?? "";
  const movementView: MovementTargetId = allow(
    isMovementTargetId(movementParameter) ? movementParameter : "",
    MOVEMENT_VIEWS_BY_KIND[dataKind],
  );
  const costMeasureParameter = searchParams.get("costMeasure") ?? "";
  const costMeasure: CostMeasureId = allow(
    isCostMeasureId(costMeasureParameter) ? costMeasureParameter : "",
    COST_MEASURES_BY_KIND[dataKind],
  );
  // The summary column is only meaningful as a raw amount — as a share it is always 100 %.
  const costCategoryOptions: readonly CostTargetId[] = costMeasure === "absolute"
    ? COST_TARGETS
    : COST_CATEGORY_IDS;
  const costCategoryParameter = searchParams.get("costCategory") ?? "0";
  const costCategory: CostTargetId = allow(
    isCostTargetId(costCategoryParameter) ? costCategoryParameter : "0",
    costCategoryOptions,
  );
  const politicsViewParameter = searchParams.get("politicsView") ?? "";
  const politicsView: PoliticsView = allow(
    isPoliticsView(politicsViewParameter) ? politicsViewParameter : "",
    POLITICS_VIEWS_BY_KIND[dataKind],
  );
  const politicsPartyParameter = searchParams.get("politicsParty") ?? "oevp";
  const politicsParty: CanonicalPartyId = isCanonicalPartyId(politicsPartyParameter) ? politicsPartyParameter : "oevp";
  const digitalViewParameter = searchParams.get("digitalView") ?? "";
  const digitalViewOptions = DIGITAL_VIEWS_BY_KIND[dataKind].length ? DIGITAL_VIEWS_BY_KIND[dataKind] : DIGITAL_VIEWS_BY_KIND.base;
  const digitalView: DigitalPlatformViewId = allow(
    isDigitalPlatformViewId(digitalViewParameter) ? digitalViewParameter : "",
    digitalViewOptions,
  );
  return {
    dataKind, metric, customMetric, populationView, ageView, indicator, ageGroup, ageMeasure, sex,
    movementView, costMeasure, costCategoryOptions, costCategory, politicsView, politicsParty,
    digitalViewOptions, digitalView,
  };
}
