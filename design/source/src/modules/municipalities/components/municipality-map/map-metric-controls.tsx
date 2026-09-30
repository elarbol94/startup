"use client";

// Desktop metric, view and year control panel overlaid on the municipality map.
// Used by municipality-map.tsx.
import type { CostMeasureId, CostTargetId } from "../../costs";
import type { DigitalPlatformViewId } from "../../digital-platforms";
import type { AgeViewId, MapMetric } from "../../demography";
import type { MovementTargetId } from "../../movement";
import type { DataKind } from "../../kennzahlen";
import type { CanonicalPartyId, PoliticsView } from "../../politics";
import type { PopulationViewId } from "../../structure";
import type { MapMetricControlsProps } from "./map-types";

export function MapMetricControls({
  labels, dataKind, metric, populationView, populationDefinition, structureLoading, structureError,
  ageView, showAgeFilters, sex, indicatorDefinition, ageLoading, ageError, movementView,
  movementDefinition, movementLoading, movementError, politicsView, politicsParty, politicsLoading,
  politicsError, customView, digitalView, digitalLoading, digitalError, costMeasure, costCategory,
  costsLoading, costsError, peerGroupLabel, year, firstYear, latestYear, onDataKindChange,
  onMetricChange, onPopulationViewChange, onAgeViewChange, onSexChange, onMovementViewChange,
  onPoliticsViewChange, onPoliticsPartyChange, onCustomViewChange, onCustomDelete,
  onDigitalViewChange, onCostMeasureChange, onCostCategoryChange, onYearChange,
}: MapMetricControlsProps) {
  const controlButton =
    "rounded-md px-2 py-1 text-[10px] font-medium aria-pressed:bg-teal-700 aria-pressed:text-white hover:bg-accent";
  return (
    <div
      className="absolute top-16 left-3 z-10 hidden w-[min(20rem,calc(100%-1.5rem))] rounded-xl border bg-background/95 p-3 shadow-sm backdrop-blur lg:block"
      data-testid="metric-control"
    >
      <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
        <label htmlFor="municipality-data-kind" className="text-xs font-semibold">
          {labels.dataKind}
        </label>
        <select
          id="municipality-data-kind"
          value={dataKind}
          className="h-8 min-w-0 rounded-md border bg-background px-2 text-xs"
          onChange={(event) => onDataKindChange(event.target.value as DataKind)}
        >
          <option value="base">{labels.dataKinds.base}</option>
          <option value="derived">{labels.dataKinds.derived}</option>
        </select>
      </div>
      <div className="mt-2 grid grid-cols-[5.5rem_1fr] items-center gap-2">
        <label
          htmlFor="municipality-metric"
          className="text-xs font-semibold"
        >
          {labels.metric}
        </label>
        <select
          id="municipality-metric"
          value={metric}
          className="h-8 min-w-0 rounded-md border bg-background px-2 text-xs"
          onChange={(event) =>
            onMetricChange(event.target.value as MapMetric)
          }
        >
          {Object.entries(labels.metrics).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>
      {metric === "population" && (
        <div className="mt-2 space-y-2 border-t pt-2">
          <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
            <label htmlFor="municipality-population-view" className="text-[10px] font-semibold">
              {labels.populationView}
            </label>
            <select
              id="municipality-population-view"
              value={populationView}
              className="h-8 min-w-0 rounded-md border bg-background px-2 text-[10px]"
              onChange={(event) => onPopulationViewChange(event.target.value as PopulationViewId)}
            >
              {Object.entries(labels.populationViews).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>
          {populationDefinition && (
            <p className="text-[10px] leading-4 text-muted-foreground" data-testid="population-definition">
              {populationDefinition}
            </p>
          )}
          {structureLoading && (
            <p className="text-[10px] text-muted-foreground">{labels.loadingStructure}</p>
          )}
          {structureError && (
            <p className="text-[10px] text-destructive" role="alert">{labels.structureError}</p>
          )}
        </div>
      )}
      {metric === "age" && (
        <div className="mt-2 space-y-2 border-t pt-2">
          <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
            <label
              htmlFor="municipality-age-view"
              className="text-[10px] font-semibold"
            >
              {labels.ageView}
            </label>
            <select
              id="municipality-age-view"
              value={ageView}
              className="h-8 min-w-0 rounded-md border bg-background px-2 text-[10px]"
              onChange={(event) =>
                onAgeViewChange(event.target.value as AgeViewId)
              }
            >
              <optgroup label={labels.ageGroupsHeading}>
                {Object.entries(labels.ageGroups).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </optgroup>
              {Object.keys(labels.indicators).length > 0 && (
                <optgroup label={labels.indicatorsHeading}>
                  {Object.entries(labels.indicators).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          {showAgeFilters ? (
            <div className="flex flex-wrap gap-1">
              <div className="flex rounded-lg border bg-background p-0.5">
                {(["all", "female", "male"] as const).map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={controlButton}
                    aria-pressed={sex === item}
                    onClick={() => onSexChange(item)}
                  >
                    {labels.sexes[item]}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p
              className="text-[10px] leading-4 text-muted-foreground"
              data-testid="indicator-definition"
            >
              {indicatorDefinition}
            </p>
          )}
          {ageLoading && (
            <p className="text-[10px] text-muted-foreground">
              {labels.loadingAge}
            </p>
          )}
          {ageError && (
            <p className="text-[10px] text-destructive" role="alert">
              {labels.ageError}
            </p>
          )}
        </div>
      )}
      {metric === "movement" && (
        <div className="mt-2 space-y-2 border-t pt-2">
          <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
            <label
              htmlFor="municipality-movement-view"
              className="text-[10px] font-semibold"
            >
              {labels.movementView}
            </label>
            <select
              id="municipality-movement-view"
              value={movementView}
              className="h-8 min-w-0 rounded-md border bg-background px-2 text-[10px]"
              onChange={(event) =>
                onMovementViewChange(event.target.value as MovementTargetId)
              }
            >
              {Object.entries(labels.movements).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {movementDefinition && (
            <p
              className="text-[10px] leading-4 text-muted-foreground"
              data-testid="movement-definition"
            >
              {movementDefinition}
            </p>
          )}
          {movementLoading && (
            <p className="text-[10px] text-muted-foreground">
              {labels.loadingMovement}
            </p>
          )}
          {movementError && (
            <p className="text-[10px] text-destructive" role="alert">
              {labels.movementError}
            </p>
          )}
        </div>
      )}
      {metric === "politics" && (
        <div className="mt-2 space-y-2 border-t pt-2">
          <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
            <label htmlFor="municipality-politics-view" className="text-[10px] font-semibold">{labels.politicsView}</label>
            <select id="municipality-politics-view" value={politicsView} className="h-8 min-w-0 rounded-md border bg-background px-2 text-[10px]" onChange={(event) => onPoliticsViewChange(event.target.value as PoliticsView)}>
              {Object.entries(labels.politicsViews).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          {politicsView === "party-share" ? <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
            <label htmlFor="municipality-politics-party" className="text-[10px] font-semibold">{labels.politicsParty}</label>
            <select id="municipality-politics-party" value={politicsParty} className="h-8 min-w-0 rounded-md border bg-background px-2 text-[10px]" onChange={(event) => onPoliticsPartyChange(event.target.value as CanonicalPartyId)}>
              {Object.entries(labels.politicsParties).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div> : null}
          {politicsLoading ? <p className="text-[10px] text-muted-foreground">{labels.loadingPolitics}</p> : null}
          {politicsError ? <p className="text-[10px] text-destructive" role="alert">{labels.politicsError}</p> : null}
        </div>
      )}
      {metric === "custom" && (
        <div className="mt-2 space-y-2 border-t pt-2" data-testid="custom-metric-control">
          <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
            <label htmlFor="municipality-custom-view" className="text-[10px] font-semibold">{labels.customView}</label>
            <select
              id="municipality-custom-view"
              value={customView}
              className="h-8 min-w-0 rounded-md border bg-background px-2 text-[10px]"
              onChange={(event) => onCustomViewChange(event.target.value)}
            >
              {Object.entries(labels.customViews).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          <button
            type="button"
            className="text-[10px] text-muted-foreground underline underline-offset-2 hover:text-destructive"
            onClick={() => {
              if (customView && window.confirm(labels.customDeleteConfirm)) onCustomDelete(customView);
            }}
          >
            {labels.customDelete}
          </button>
        </div>
      )}
      {metric === "digital" && (
        <div className="mt-2 space-y-2 border-t pt-2">
          <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
            <label htmlFor="municipality-digital-view" className="text-[10px] font-semibold">{labels.digitalView}</label>
            <select id="municipality-digital-view" value={digitalView} className="h-8 min-w-0 rounded-md border bg-background px-2 text-[10px]" onChange={(event) => onDigitalViewChange(event.target.value as DigitalPlatformViewId)}>
              {Object.entries(labels.digitalViews).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          <p className="text-[10px] leading-4 text-muted-foreground">{labels.digitalDefinition}</p>
          {digitalLoading ? <p className="text-[10px] text-muted-foreground">{labels.loadingDigital}</p> : null}
          {digitalError ? <p className="text-[10px] text-destructive" role="alert">{labels.digitalError}</p> : null}
        </div>
      )}
      {metric === "costs" && (
        <div className="mt-2 space-y-2 border-t pt-2">
          <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
            <label htmlFor="municipality-cost-measure" className="text-[10px] font-semibold">
              {labels.costMeasure}
            </label>
            <select
              id="municipality-cost-measure"
              value={costMeasure}
              className="h-8 min-w-0 rounded-md border bg-background px-2 text-[10px]"
              onChange={(event) => onCostMeasureChange(event.target.value as CostMeasureId)}
            >
              {Object.entries(labels.costMeasures).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-[5.5rem_1fr] items-center gap-2">
            <label htmlFor="municipality-cost-view" className="text-[10px] font-semibold">
              {labels.costView}
            </label>
            <select
              id="municipality-cost-view"
              value={costCategory}
              className="h-8 min-w-0 rounded-md border bg-background px-2 text-[10px]"
              onChange={(event) => onCostCategoryChange(event.target.value as CostTargetId)}
            >
              {Object.entries(labels.costCategories).map(([id, label]) => (
                <option key={id} value={id}>{id} · {label}</option>
              ))}
            </select>
          </div>
          {costsLoading && <p className="text-[10px] text-muted-foreground">{labels.loadingCosts}</p>}
          <p className="text-[10px] leading-4 text-muted-foreground" data-testid="cost-definition">
            {labels.costDefinition}
          </p>
          {peerGroupLabel && (
            <p className="rounded-md border border-teal-200 bg-teal-50 px-2 py-1.5 text-[10px] leading-4 text-teal-900 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-100" data-testid="peer-comparison-group">
              {peerGroupLabel}
            </p>
          )}
          {costsError && <p className="text-[10px] text-destructive" role="alert">{labels.costsError}</p>}
        </div>
      )}
      {metric !== "digital" ? <><div className="mt-2 flex items-baseline justify-between gap-3 border-t pt-2">
        <label
          htmlFor="municipality-population-year"
          className="text-xs font-semibold"
        >
          {labels.year}
        </label>
        <output
          htmlFor="municipality-population-year"
          className="text-sm font-semibold tabular-nums"
        >
          {year}
        </output>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          className="grid size-7 shrink-0 place-items-center rounded-md border"
          aria-label={labels.previousYear}
          disabled={year === firstYear}
          onClick={() => onYearChange(year - 1)}
        >
          ‹
        </button>
        <input
          id="municipality-population-year"
          type="range"
          min={firstYear}
          max={latestYear}
          value={year}
          aria-label={labels.year}
          className="h-2 min-w-0 flex-1 accent-teal-700"
          onChange={(event) => onYearChange(Number(event.target.value))}
        />
        <button
          type="button"
          className="grid size-7 shrink-0 place-items-center rounded-md border"
          aria-label={labels.nextYear}
          disabled={year === latestYear}
          onClick={() => onYearChange(year + 1)}
        >
          ›
        </button>
      </div></> : null}
    </div>
  );
}
