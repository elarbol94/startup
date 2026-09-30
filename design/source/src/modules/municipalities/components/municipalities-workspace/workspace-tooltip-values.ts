// Builds the per-municipality hover text of the workspace map for the selected metric and year.
// Used by municipalities-workspace.tsx.
import type { useTranslations } from "next-intl";
import type { CostMeasureId, CostTargetId, MunicipalityCostSeries } from "../../costs";
import type { MunicipalityIndex } from "../../data";
import type { DigitalPlatformViewId, MunicipalityDigitalPlatformDataset } from "../../digital-platforms";
import {
  demographicIndicatorValue,
  demographyPopulation,
  demographyValue,
  type AgeGroupId,
  type DemographicIndicatorId,
  type MapMetric,
  type MunicipalityDemographySeries,
  type SexFilter,
} from "../../demography";
import type { MovementTargetId, MunicipalityMovementSeries } from "../../movement";
import {
  electionAsOf,
  leadingElectionList,
  politicsMapValue,
  type CanonicalPartyId,
  type MunicipalityElectionHistoryDataset,
  type PoliticsView,
} from "../../politics";
import type { MunicipalityPopulationSeries } from "../../population";
import type { PopulationViewId } from "../../structure";
import type { WorkspaceFormatters } from "./use-workspace-formatters";
import type { WorkspaceLabels } from "./use-workspace-labels";

export function buildTooltipValues({
  metric, index, metricValues, digitalView, digitalPlatforms, activePopulation, t, populationView,
  populationViewFormatter, populationUnitLabel, activeDemography, indicator, indicatorFormatter,
  indicatorUnitLabel, sex, ageGroup, activeMovement, valueFor, year, movementView,
  movementFormatter, movementUnitLabel, activeCosts, costCategory, costMeasure, electionHistory,
  politicsView, politicsParty, digitalProviderDescription, digitalProviderCostDescription,
  digitalViewLabels, populationViewLabels, indicatorLabels, ageGroupLabels, movementLabels,
  costCategoryLabels, costMeasureLabels, politicsViewLabels, politicsPartyLabels, personsFormatter,
  shareFormatter, currencyFormatter,
}: {
  metric: MapMetric;
  index: MunicipalityIndex;
  metricValues: Record<string, number | null>;
  digitalView: DigitalPlatformViewId;
  digitalPlatforms: MunicipalityDigitalPlatformDataset | null;
  activePopulation: MunicipalityPopulationSeries["years"][string];
  t: ReturnType<typeof useTranslations<"municipalities">>;
  populationView: PopulationViewId;
  populationViewFormatter: Intl.NumberFormat;
  populationUnitLabel: string;
  activeDemography: MunicipalityDemographySeries["years"][string] | null;
  indicator: DemographicIndicatorId | null;
  indicatorFormatter: Intl.NumberFormat;
  indicatorUnitLabel: string;
  sex: SexFilter;
  ageGroup: AgeGroupId;
  activeMovement: MunicipalityMovementSeries["years"][string] | null;
  valueFor: (code: string, year: number) => number | null;
  year: number;
  movementView: MovementTargetId;
  movementFormatter: Intl.NumberFormat;
  movementUnitLabel: string;
  activeCosts: MunicipalityCostSeries["years"][string] | null;
  costCategory: CostTargetId;
  costMeasure: CostMeasureId;
  electionHistory: MunicipalityElectionHistoryDataset | null;
  politicsView: PoliticsView;
  politicsParty: CanonicalPartyId;
} & Pick<
  WorkspaceLabels,
  | "digitalProviderDescription"
  | "digitalProviderCostDescription"
  | "digitalViewLabels"
  | "populationViewLabels"
  | "indicatorLabels"
  | "ageGroupLabels"
  | "movementLabels"
  | "costCategoryLabels"
  | "costMeasureLabels"
  | "politicsViewLabels"
  | "politicsPartyLabels"
> & Pick<WorkspaceFormatters, "personsFormatter" | "shareFormatter" | "currencyFormatter">) {
  const tooltipValues =
    metric === "digital"
      ? Object.fromEntries(index.municipalities.map(({ municipalityCode }) => {
          const value = metricValues[municipalityCode];
          const label = digitalView === "providers"
            ? `${digitalProviderDescription(digitalPlatforms?.municipalities[municipalityCode])} · ${digitalProviderCostDescription(
                digitalPlatforms?.municipalities[municipalityCode],
                activePopulation.values[municipalityCode],
              )}`
            : value === null
              ? t("digitalCoverageUnknown")
              : value === 0
                ? t("digitalNoneFound")
                : digitalView === "overview"
                  ? t("digitalTooltipAreas", { count: value })
                  : t("digitalTooltipPlatforms", { count: value });
          return [municipalityCode, digitalViewLabels[digitalView] + " · " + label];
        }))
      : metric === "population" && populationView !== "count"
      ? Object.fromEntries(
          index.municipalities.map(({ municipalityCode }) => {
            const value = metricValues[municipalityCode];
            return [
              municipalityCode,
              populationViewLabels[populationView] + " · "
                + (value === null ? "—" : populationViewFormatter.format(value) + (populationUnitLabel ? " " + populationUnitLabel : "")),
            ];
          }),
        )
      : metric === "age" && activeDemography
      ? Object.fromEntries(
          index.municipalities.map(({ municipalityCode }) => {
            const counts = activeDemography.values[municipalityCode];
            if (indicator) {
              const value = demographicIndicatorValue(counts, indicator);
              return [
                municipalityCode,
                (
                  indicatorLabels[indicator] +
                  " · " +
                  (value === null ? "—" : indicatorFormatter.format(value)) +
                  " " +
                  (indicatorUnitLabel)
                ).trim(),
              ];
            }
            const persons = demographyValue(counts, sex, ageGroup);
            const denominator = demographyPopulation(counts, sex);
            const share = denominator > 0 ? persons / denominator : null;
            return [
              municipalityCode,
              ageGroupLabels[ageGroup] +
                " · " +
                personsFormatter.format(persons) +
                " " +
                t("populationUnit") +
                " · " +
                (share === null ? "—" : shareFormatter.format(share)) +
                (sex === "female"
                  ? " (" + t("sexFemale") + ")"
                  : sex === "male"
                    ? " (" + t("sexMale") + ")"
                    : ""),
            ];
          }),
        )
      : metric === "movement" && activeMovement
        ? Object.fromEntries(
            index.municipalities.map(({ municipalityCode }) => {
              const value = valueFor(municipalityCode, year);
              return [
                municipalityCode,
                movementLabels[movementView] +
                  " · " +
                  (value === null
                    ? "—"
                    : movementFormatter.format(value) +
                      " " +
                      movementUnitLabel),
              ];
            }),
          )
        : metric === "costs" && activeCosts
          ? Object.fromEntries(
              index.municipalities.map(({ municipalityCode }) => {
                const value = metricValues[municipalityCode];
                if (value === null) return [municipalityCode, `${costCategoryLabels[costCategory]} · ${t("costNoData")}`];
                const formatter = costMeasure === "share" || costMeasure === "peer-deviation" ? shareFormatter : currencyFormatter;
                return [municipalityCode, `${costCategoryLabels[costCategory]} · ${costMeasureLabels[costMeasure]} · ${formatter.format(value)}`];
              }),
            )
          : metric === "politics"
            ? Object.fromEntries(index.municipalities.map(({ municipalityCode }) => {
                const event = electionAsOf(electionHistory?.municipalities[municipalityCode]?.events ?? [], year);
                if (!event) return [municipalityCode, t("politicsOfficialCoverageMissing")];
                const turnout = event.eligibleVoters && event.ballotsCast !== null ? shareFormatter.format(event.ballotsCast / event.eligibleVoters) : "—";
                if (politicsView === "turnout") return [municipalityCode, `${event.date} · ${politicsViewLabels.turnout} · ${turnout}`];
                if (politicsView === "party-share") { const value = politicsMapValue(event, politicsView, politicsParty); return [municipalityCode, `${event.date} · ${politicsPartyLabels[politicsParty]} · ${value === null ? "—" : shareFormatter.format(value)} · ${politicsViewLabels.turnout} ${turnout}`]; }
                const leading = leadingElectionList(event);
                if (leading.kind === "missing") return [municipalityCode, `${event.date} · —`];
                if (leading.kind === "tie") return [municipalityCode, `${event.date} · ${t("politicsTie")} · ${politicsViewLabels.turnout} ${turnout}`];
                const aggregation = event.aggregationStatus === "aggregated-predecessors" ? ` · ${t("politicsAggregated")}` : "";
                return [municipalityCode, `${event.date} · ${leading.list.name} · ${event.validVotes ? shareFormatter.format(leading.list.votes / event.validVotes) : "—"} · ${politicsViewLabels.turnout} ${turnout}${aggregation}`];
              }))
            : null;
  return tooltipValues;
}
