"use client";

// Metric, view and year controls inside the mobile "display" bottom sheet of the municipality map.
// Used by municipality-map.tsx.
import type { CostMeasureId, CostTargetId } from "../../costs";
import type { DigitalPlatformViewId } from "../../digital-platforms";
import type { AgeViewId, MapMetric } from "../../demography";
import type { MovementTargetId } from "../../movement";
import type { DataKind } from "../../kennzahlen";
import type { CanonicalPartyId, PoliticsView } from "../../politics";
import type { PopulationViewId } from "../../structure";
import type { MapMetricControlsProps } from "./map-types";

export function MobileMetricControls({
  labels, dataKind, metric, populationView, populationDefinition, structureLoading, structureError,
  ageView, showAgeFilters, sex, indicatorDefinition, ageLoading, ageError, movementView,
  movementDefinition, movementLoading, movementError, politicsView, politicsParty, politicsLoading,
  politicsError, customView, digitalView, digitalLoading, digitalError, costMeasure, costCategory,
  costsLoading, costsError, peerGroupLabel, year, firstYear, latestYear, onDataKindChange,
  onMetricChange, onPopulationViewChange, onAgeViewChange, onSexChange, onMovementViewChange,
  onPoliticsViewChange, onPoliticsPartyChange, onCustomViewChange, onDigitalViewChange,
  onCostMeasureChange, onCostCategoryChange, onYearChange,
}: MapMetricControlsProps) {
  return (
    <div className="space-y-5" data-testid="mobile-metric-control">
      <div className="space-y-2">
        <label htmlFor="municipality-data-kind-mobile" className="text-sm font-semibold">{labels.dataKind}</label>
        <select
          id="municipality-data-kind-mobile"
          value={dataKind}
          className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          onChange={(event) => onDataKindChange(event.target.value as DataKind)}
        >
          <option value="base">{labels.dataKinds.base}</option>
          <option value="derived">{labels.dataKinds.derived}</option>
        </select>
      </div>

      <div className="space-y-2 border-t pt-4">
        <label htmlFor="municipality-metric-mobile" className="text-sm font-semibold">{labels.metric}</label>
        <select
          id="municipality-metric-mobile"
          value={metric}
          className="h-11 w-full rounded-md border bg-background px-3 text-sm"
          onChange={(event) => onMetricChange(event.target.value as MapMetric)}
        >
          {Object.entries(labels.metrics).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>

      {metric === "population" ? (
        <div className="space-y-2 border-t pt-4">
          <label htmlFor="municipality-population-view-mobile" className="text-sm font-semibold">{labels.populationView}</label>
          <select
            id="municipality-population-view-mobile"
            value={populationView}
            className="h-11 w-full rounded-md border bg-background px-3 text-sm"
            onChange={(event) => onPopulationViewChange(event.target.value as PopulationViewId)}
          >
            {Object.entries(labels.populationViews).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          {populationDefinition ? <p className="text-xs leading-5 text-muted-foreground">{populationDefinition}</p> : null}
          {structureLoading ? <p className="text-xs text-muted-foreground">{labels.loadingStructure}</p> : null}
          {structureError ? <p className="text-xs text-destructive" role="alert">{labels.structureError}</p> : null}
        </div>
      ) : null}

      {metric === "age" ? (
        <div className="space-y-3 border-t pt-4">
          <label htmlFor="municipality-age-view-mobile" className="text-sm font-semibold">{labels.ageView}</label>
          <select
            id="municipality-age-view-mobile"
            value={ageView}
            className="h-11 w-full rounded-md border bg-background px-3 text-sm"
            onChange={(event) => onAgeViewChange(event.target.value as AgeViewId)}
          >
            <optgroup label={labels.ageGroupsHeading}>
              {Object.entries(labels.ageGroups).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </optgroup>
            {Object.keys(labels.indicators).length > 0 ? (
              <optgroup label={labels.indicatorsHeading}>
                {Object.entries(labels.indicators).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </optgroup>
            ) : null}
          </select>
          {showAgeFilters ? (
            <div className="space-y-2">
              <div className="grid grid-cols-3 overflow-hidden rounded-lg border">
                {(["all", "female", "male"] as const).map((item) => (
                  <button key={item} type="button" className="min-h-11 px-2 text-sm font-medium aria-pressed:bg-teal-700 aria-pressed:text-white" aria-pressed={sex === item} onClick={() => onSexChange(item)}>{labels.sexes[item]}</button>
                ))}
              </div>
            </div>
          ) : <p className="text-xs leading-5 text-muted-foreground">{indicatorDefinition}</p>}
          {ageLoading ? <p className="text-xs text-muted-foreground">{labels.loadingAge}</p> : null}
          {ageError ? <p className="text-xs text-destructive" role="alert">{labels.ageError}</p> : null}
        </div>
      ) : null}

      {metric === "movement" ? (
        <div className="space-y-2 border-t pt-4">
          <label htmlFor="municipality-movement-view-mobile" className="text-sm font-semibold">{labels.movementView}</label>
          <select
            id="municipality-movement-view-mobile"
            value={movementView}
            className="h-11 w-full rounded-md border bg-background px-3 text-sm"
            onChange={(event) => onMovementViewChange(event.target.value as MovementTargetId)}
          >
            {Object.entries(labels.movements).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          {movementDefinition ? <p className="text-xs leading-5 text-muted-foreground">{movementDefinition}</p> : null}
          {movementLoading ? <p className="text-xs text-muted-foreground">{labels.loadingMovement}</p> : null}
          {movementError ? <p className="text-xs text-destructive" role="alert">{labels.movementError}</p> : null}
        </div>
      ) : null}

      {metric === "politics" ? (
        <div className="space-y-3 border-t pt-4">
          <div className="space-y-2"><label htmlFor="municipality-politics-view-mobile" className="text-sm font-semibold">{labels.politicsView}</label>
            <select id="municipality-politics-view-mobile" value={politicsView} className="h-11 w-full rounded-md border bg-background px-3 text-sm" onChange={(event) => onPoliticsViewChange(event.target.value as PoliticsView)}>
              {Object.entries(labels.politicsViews).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select></div>
          {politicsView === "party-share" ? <div className="space-y-2"><label htmlFor="municipality-politics-party-mobile" className="text-sm font-semibold">{labels.politicsParty}</label>
            <select id="municipality-politics-party-mobile" value={politicsParty} className="h-11 w-full rounded-md border bg-background px-3 text-sm" onChange={(event) => onPoliticsPartyChange(event.target.value as CanonicalPartyId)}>
              {Object.entries(labels.politicsParties).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select></div> : null}
          {politicsLoading ? <p className="text-xs text-muted-foreground">{labels.loadingPolitics}</p> : null}
          {politicsError ? <p className="text-xs text-destructive" role="alert">{labels.politicsError}</p> : null}
        </div>
      ) : null}

      {metric === "custom" ? (
        <div className="space-y-2 border-t pt-4">
          <label htmlFor="municipality-custom-view-mobile" className="text-sm font-semibold">{labels.customView}</label>
          <select id="municipality-custom-view-mobile" value={customView} className="h-11 w-full rounded-md border bg-background px-3 text-sm" onChange={(event) => onCustomViewChange(event.target.value)}>
            {Object.entries(labels.customViews).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </div>
      ) : null}

      {metric === "digital" ? (
        <div className="space-y-3 border-t pt-4">
          <label htmlFor="municipality-digital-view-mobile" className="text-sm font-semibold">{labels.digitalView}</label>
          <select id="municipality-digital-view-mobile" value={digitalView} className="h-11 w-full rounded-md border bg-background px-3 text-sm" onChange={(event) => onDigitalViewChange(event.target.value as DigitalPlatformViewId)}>
            {Object.entries(labels.digitalViews).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <p className="text-xs leading-5 text-muted-foreground">{labels.digitalDefinition}</p>
          {digitalLoading ? <p className="text-xs text-muted-foreground">{labels.loadingDigital}</p> : null}
          {digitalError ? <p className="text-xs text-destructive" role="alert">{labels.digitalError}</p> : null}
        </div>
      ) : null}

      {metric === "costs" ? (
        <div className="space-y-3 border-t pt-4">
          <div className="space-y-2">
            <label htmlFor="municipality-cost-measure-mobile" className="text-sm font-semibold">{labels.costMeasure}</label>
            <select id="municipality-cost-measure-mobile" value={costMeasure} className="h-11 w-full rounded-md border bg-background px-3 text-sm" onChange={(event) => onCostMeasureChange(event.target.value as CostMeasureId)}>
              {Object.entries(labels.costMeasures).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="municipality-cost-view-mobile" className="text-sm font-semibold">{labels.costView}</label>
            <select id="municipality-cost-view-mobile" value={costCategory} className="h-11 w-full rounded-md border bg-background px-3 text-sm" onChange={(event) => onCostCategoryChange(event.target.value as CostTargetId)}>
              {Object.entries(labels.costCategories).map(([id, label]) => <option key={id} value={id}>{id} · {label}</option>)}
            </select>
          </div>
          {costsLoading ? <p className="text-xs text-muted-foreground">{labels.loadingCosts}</p> : null}
          <p className="text-xs leading-5 text-muted-foreground">{labels.costDefinition}</p>
          {peerGroupLabel ? <p className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-900 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-100">{peerGroupLabel}</p> : null}
          {costsError ? <p className="text-xs text-destructive" role="alert">{labels.costsError}</p> : null}
        </div>
      ) : null}

      {metric !== "digital" ? <div className="space-y-3 border-t pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor="municipality-population-year-mobile" className="text-sm font-semibold">{labels.year}</label>
          <output htmlFor="municipality-population-year-mobile" className="text-lg font-semibold tabular-nums">{year}</output>
        </div>
        <div className="flex items-center gap-3">
          <button type="button" className="grid size-11 shrink-0 place-items-center rounded-md border text-xl" aria-label={labels.previousYear} disabled={year === firstYear} onClick={() => onYearChange(year - 1)}>‹</button>
          <input id="municipality-population-year-mobile" type="range" min={firstYear} max={latestYear} value={year} aria-label={labels.year} className="h-2 min-w-0 flex-1 accent-teal-700" onChange={(event) => onYearChange(Number(event.target.value))} />
          <button type="button" className="grid size-11 shrink-0 place-items-center rounded-md border text-xl" aria-label={labels.nextYear} disabled={year === latestYear} onClick={() => onYearChange(year + 1)}>›</button>
        </div>
      </div> : null}
    </div>
  );
}
