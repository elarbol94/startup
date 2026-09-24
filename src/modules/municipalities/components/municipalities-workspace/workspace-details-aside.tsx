"use client";

// Desktop sidebar of the municipalities workspace: the selected municipality's details and the data basis.
// Used by municipalities-workspace.tsx; its props type is shared with workspace-details-sheet.tsx.
import type { ComponentProps, Dispatch, ReactNode, SetStateAction } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Database, Landmark, MapPinned, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MunicipalityDigitalPlatformsPanel } from "../municipality-digital-platforms-panel";
import { MunicipalityPoliticsPanel } from "../municipality-politics-panel";
import type { CostMeasureId, MunicipalityCostSeries } from "../../costs";
import type { MunicipalityIndex, MunicipalityIndexItem } from "../../data";
import type {
  DigitalPlatformViewId,
  MunicipalityDigitalPlatformDataset,
  MunicipalityDigitalPlatformProfile,
} from "../../digital-platforms";
import type { MapMetric, MunicipalityDemographySeries } from "../../demography";
import type { MunicipalityMovementSeries } from "../../movement";
import type { MunicipalityCurrentPoliticsDataset, MunicipalityElectionHistoryDataset } from "../../politics";
import type { MunicipalityPopulationSeries } from "../../population";
import type { MunicipalityStructureSeries } from "../../structure";

/** What the desktop sidebar and the mobile details sheet both show about the selection. */
export type WorkspaceDetailsProps = {
  selected: MunicipalityIndexItem | null;
  detailFacts: ReactNode;
  metric: MapMetric;
  digitalView: DigitalPlatformViewId;
  renderDigitalCostMethodology: () => ReactNode;
  selectedDigitalPlatforms: MunicipalityDigitalPlatformProfile | null;
  digitalPlatforms: MunicipalityDigitalPlatformDataset | null;
  selectedCurrentPolitics: ComponentProps<typeof MunicipalityPoliticsPanel>["current"];
  currentPolitics: MunicipalityCurrentPoliticsDataset | null;
  selectedElectionHistory: ComponentProps<typeof MunicipalityPoliticsPanel>["history"];
  electionHistory: MunicipalityElectionHistoryDataset | null;
  politicsHistoryRequested: boolean;
  politicsError: boolean;
  setPoliticsHistoryRequested: Dispatch<SetStateAction<boolean>>;
  digitalReferenceDate: string;
  year: number;
  usesCitizenship: boolean;
  investmentMunicipalityCodes: Set<string> | null;
  updateSelection: (item: MunicipalityIndexItem | null) => void;
  index: MunicipalityIndex;
  populationSeries: MunicipalityPopulationSeries;
};

export function WorkspaceDetailsAside({
  selected, detailFacts, metric, digitalView, renderDigitalCostMethodology,
  selectedDigitalPlatforms, digitalPlatforms, selectedCurrentPolitics, currentPolitics,
  selectedElectionHistory, electionHistory, politicsHistoryRequested, politicsError,
  setPoliticsHistoryRequested, digitalReferenceDate, year, usesCitizenship,
  investmentMunicipalityCodes, updateSelection, index, populationSeries, demographySeries,
  structureSeries, movementSeries, costSeries, costMeasure,
}: WorkspaceDetailsProps & {
  demographySeries: MunicipalityDemographySeries | null;
  structureSeries: MunicipalityStructureSeries | null;
  movementSeries: MunicipalityMovementSeries | null;
  costSeries: MunicipalityCostSeries | null;
  costMeasure: CostMeasureId;
}) {
  const t = useTranslations("municipalities");
  return (
    <aside
      className="hidden flex-col gap-4 lg:flex"
      aria-live="polite"
      data-testid="municipality-details"
    >
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        {selected ? (
          <>
            <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300">
              <MapPinned className="size-5" />
            </div>
            <p className="text-xs font-semibold tracking-[0.14em] text-teal-700 uppercase dark:text-teal-300">
              {t("selectedMunicipality")}
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              {selected.name}
            </h2>
            <div className="mt-5">{detailFacts}</div>
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
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
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
            {investmentMunicipalityCodes?.has(selected.municipalityCode) && (
              <Button
                variant="outline"
                className="mt-5 w-full"
                render={<Link href={`/municipalities/${selected.municipalityCode}/investments`} />}
              >
                <Landmark className="size-4" />
                {t("investmentDetails")}
              </Button>
            )}
            <Button
              variant="outline"
              className={investmentMunicipalityCodes?.has(selected.municipalityCode) ? "mt-2 w-full" : "mt-5 w-full"}
              onClick={() => updateSelection(null)}
            >
              <X className="size-4" />
              {t("clearSelection")}
            </Button>
          </>
        ) : (
          <>
            <div className="mb-4 flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <MapPinned className="size-5" />
            </div>
            <h2 className="font-semibold">{t("selectionTitle")}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t("selectionDescription")}
            </p>
          </>
        )}
      </div>
      <div className="rounded-2xl border bg-muted/30 p-4 text-xs leading-5 text-muted-foreground">
        <div className="mb-2 flex items-center gap-2 font-semibold text-foreground">
          <Database className="size-4" />
          {t("dataBasis")}
        </div>
        <p>{t("dataBasisDescription", { count: index.count })}</p>
        <p className="mt-2">
          {t("populationDataBasis", {
            firstYear: populationSeries.firstYear,
            latestYear: populationSeries.latestYear,
          })}{" "}
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href={populationSeries.source.urlTemplate.replace(
              "{year}",
              String(populationSeries.latestYear),
            )}
            target="_blank"
            rel="noreferrer"
          >
            {populationSeries.source.title}
          </a>
          {` (${populationSeries.source.license}).`}
        </p>
        {demographySeries && (
          <p className="mt-2">
            {t("ageDataBasis", {
              firstYear: demographySeries.firstYear,
              latestYear: demographySeries.latestYear,
            })}
          </p>
        )}
        {structureSeries && (
          <p className="mt-2">
            {t("structureDataBasis", {
              firstYear: structureSeries.firstYear,
              latestYear: structureSeries.latestYear,
            })}{" "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href={structureSeries.source.url}
              target="_blank"
              rel="noreferrer"
            >
              {structureSeries.source.title}
            </a>
            {" (" + structureSeries.source.license + ")."}
          </p>
        )}
        {movementSeries && (
          <p className="mt-2">
            {t("movementDataBasis", {
              firstYear: movementSeries.firstYear,
              latestYear: movementSeries.latestYear,
            })}{" "}
            <a
              className="underline underline-offset-2 hover:text-foreground"
              href={movementSeries.source.url}
              target="_blank"
              rel="noreferrer"
            >
              {movementSeries.source.title}
            </a>
            {" (" + movementSeries.source.license + ")."}
          </p>
        )}
        {digitalPlatforms && (
          <p className="mt-2">{t("digitalDataBasis", { date: digitalReferenceDate })}</p>
        )}
        {costSeries && (
          <>
            <p className="mt-2">
              {t("costDataBasis", { firstYear: costSeries.firstYear, latestYear: costSeries.latestYear })}{" "}
              <a className="underline underline-offset-2 hover:text-foreground" href={costSeries.source.url} target="_blank" rel="noreferrer">
                {costSeries.source.title}
              </a>.
            </p>
            {costMeasure === "real-per-capita" && (
              <p className="mt-2">
                {t("costInflationDataBasis")}{" "}
                <a className="underline underline-offset-2 hover:text-foreground" href="https://www.statistik.at/statistiken/volkswirtschaft-und-oeffentliche-finanzen/preise-und-preisindizes/verbraucherpreisindex-vpi/hvpi" target="_blank" rel="noreferrer">
                  Statistik Austria
                </a>.
              </p>
            )}
            {metric === "costs" && <p className="mt-2">{t("costUnavailableNet")}</p>}
          </>
        )}
        <p className="mt-2">{t("geometryAttribution")}</p>
      </div>
    </aside>
  );
}
