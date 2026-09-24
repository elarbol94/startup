"use client";

// Mobile bottom sheet with the selected municipality's details, metric chart and data basis.
// Used by municipalities-workspace.tsx.
import type { Dispatch, SetStateAction } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Database, Landmark, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { MunicipalityMetricChart } from "../municipality-metric-chart";
import { MunicipalityDigitalPlatformsPanel } from "../municipality-digital-platforms-panel";
import { MunicipalityPoliticsPanel } from "../municipality-politics-panel";
import type { MunicipalityDatasetRef } from "../../analysis";
import type { PopulationViewId } from "../../structure";
import type { WorkspaceDetailsProps } from "./workspace-details-aside";

export function WorkspaceDetailsSheet({
  selected, detailFacts, metric, digitalView, renderDigitalCostMethodology,
  selectedDigitalPlatforms, digitalPlatforms, selectedCurrentPolitics, currentPolitics,
  selectedElectionHistory, electionHistory, politicsHistoryRequested, politicsError,
  setPoliticsHistoryRequested, digitalReferenceDate, year, usesCitizenship,
  investmentMunicipalityCodes, updateSelection, index, populationSeries, detailsOpen,
  setDetailsOpen, history, analysisDataset, metricLabel, chartFormatter, chartUnit, populationView,
  metricChartLabel,
}: WorkspaceDetailsProps & {
  detailsOpen: boolean;
  setDetailsOpen: Dispatch<SetStateAction<boolean>>;
  history: Array<{ year: number; value: number | null }> | null;
  analysisDataset: MunicipalityDatasetRef | null;
  metricLabel: string;
  chartFormatter: Intl.NumberFormat;
  chartUnit: string;
  populationView: PopulationViewId;
  metricChartLabel: string;
}) {
  const t = useTranslations("municipalities");
  return (
    <MobileBottomSheet
      open={detailsOpen}
      onOpenChange={setDetailsOpen}
      title={selected ? selected.name : t("selectionTitle")}
      description={selected ? t("selectedMunicipality") : t("selectionDescription")}
      closeLabel={t("mobileClose")}
    >
      <div className="space-y-4" aria-live="polite" data-testid="mobile-municipality-details">
        {selected ? (
          <>
            <div className="rounded-xl border bg-card p-4">
              {detailFacts}
              {metric === "digital" && digitalView === "providers" ? renderDigitalCostMethodology() : null}
              {metric === "digital" && selectedDigitalPlatforms && digitalPlatforms ? (
                <div className="mt-5">
                  <MunicipalityDigitalPlatformsPanel profile={selectedDigitalPlatforms} referenceDate={digitalPlatforms.referenceDate} />
                </div>
              ) : null}
              <div className="mt-5">
                <MunicipalityPoliticsPanel
                  current={selectedCurrentPolitics}
                  currentSources={currentPolitics?.sources ?? []}
                  history={selectedElectionHistory}
                  historySources={electionHistory?.sources ?? []}
                  loadingHistory={politicsHistoryRequested && !electionHistory && !politicsError}
                  historyError={politicsError}
                  onOpenHistory={() => setPoliticsHistoryRequested(true)}
                />
              </div>
              <p className="mt-4 flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
                <Users className="size-3.5" />
                {metric === "digital"
                  ? t("digitalReference", { date: digitalReferenceDate })
                  : metric === "politics"
                  ? t("politicsReference", { year })
                  : metric === "costs"
                  ? t("costReference", { year })
                  : metric === "movement"
                    ? t("movementReference", { year })
                    : usesCitizenship
                      ? t("structureReference", { year })
                      : t("populationReference", { year })}
              </p>
            </div>

            {history && (analysisDataset || metric === "custom") ? (
              <MunicipalityMetricChart
                embedded
                metricLabel={metricLabel}
                municipalityName={selected.name}
                points={history}
                selectedYear={year}
                valueFormatter={chartFormatter}
                unitLabel={chartUnit}
                changeLabels={metric === "population" && populationView === "count" ? { previousYear: t("populationChangePreviousYear"), sinceFirstYear: t("populationChangeSinceFirstYear", { year: populationSeries.firstYear }) } : undefined}
                chartLabel={metricChartLabel}
                minimizeLabel={t("minimizeMetricChart")}
                expandLabel={t("expandMetricChart")}
                restoreLabel={t("restoreMetricChart")}
                dataset={analysisDataset}
                addToAnalysisLabel={t("addToAnalysis")}
                dragToAnalysisLabel={t("dragToAnalysis")}
              />
            ) : null}

            {investmentMunicipalityCodes?.has(selected.municipalityCode) ? (
              <Button className="h-11 w-full" variant="outline" render={<Link href={`/municipalities/${selected.municipalityCode}/investments`} />}>
                <Landmark className="size-4" />
                {t("investmentDetails")}
              </Button>
            ) : null}
            <Button
              className="h-11 w-full"
              variant="outline"
              onClick={() => {
                updateSelection(null);
                setDetailsOpen(false);
              }}
            >
              <X className="size-4" />
              {t("clearSelection")}
            </Button>
          </>
        ) : (
          <div className="rounded-xl border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
            {t("selectionDescription")}
          </div>
        )}
        <div className="rounded-xl border bg-muted/30 p-4 text-xs leading-5 text-muted-foreground">
          <div className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            <Database className="size-4" />
            {t("dataBasis")}
          </div>
          <p>{t("dataBasisDescription", { count: index.count })}</p>
          <p className="mt-2">
            {t("populationDataBasis", { firstYear: populationSeries.firstYear, latestYear: populationSeries.latestYear })}{" "}
            <a className="underline underline-offset-2" href={populationSeries.source.urlTemplate.replace("{year}", String(populationSeries.latestYear))} target="_blank" rel="noreferrer">{populationSeries.source.title}</a>
            {` (${populationSeries.source.license}).`}
          </p>
        </div>
      </div>
    </MobileBottomSheet>
  );
}
