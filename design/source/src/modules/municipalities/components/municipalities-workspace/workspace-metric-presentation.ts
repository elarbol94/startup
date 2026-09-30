// How the selected metric is presented: chart formatter and unit, labels, the analysis dataset it maps to,
// and how a year-over-year change is formatted. Used by municipalities-workspace.tsx.
import type { useTranslations } from "next-intl";
import { analysisUnitLabel, type MunicipalityDatasetRef } from "../../analysis";
import type { CostMeasureId, CostTargetId } from "../../costs";
import type { MunicipalityIndexItem } from "../../data";
import type { DigitalPlatformViewId } from "../../digital-platforms";
import type {
  AgeGroupId,
  AgeMeasure,
  DemographicIndicatorId,
  demographicIndicatorUnit,
  MapMetric,
  SexFilter,
} from "../../demography";
import type { MovementTargetId, movementTargetUnit } from "../../movement";
import type { CanonicalPartyId, PoliticsView } from "../../politics";
import type { MunicipalityMetricRecord } from "../../queries";
import type { PopulationViewId, populationViewUnit } from "../../structure";
import type { WorkspaceFormatters } from "./use-workspace-formatters";
import type { WorkspaceLabels } from "./use-workspace-labels";
import { formatSigned } from "./workspace-utils";

export function describeWorkspaceMetric({
  metric, t, costMeasure, indicator, indicatorUnit, ageMeasure, customMetric, digitalView,
  activeValue, movementFormatter, populationViewFormatter, movementUnitLabel, populationUnitLabel,
  politicsView, politicsParty, costCategory, populationView, movementView, ageGroup, sex, selected,
  populationUnit, movementUnit, digitalViewLabels, politicsViewLabels, politicsPartyLabels,
  costCategoryLabels, costMeasureLabels, populationViewLabels, movementLabels, indicatorLabels,
  ageGroupLabels, ratioFormatter, personsFormatter, shareFormatter, currencyFormatter,
  signedDecimalFormatter,
}: {
  metric: MapMetric;
  t: ReturnType<typeof useTranslations<"municipalities">>;
  costMeasure: CostMeasureId;
  indicator: DemographicIndicatorId | null;
  indicatorUnit: ReturnType<typeof demographicIndicatorUnit> | null;
  ageMeasure: AgeMeasure;
  customMetric: MunicipalityMetricRecord | null;
  digitalView: DigitalPlatformViewId;
  activeValue: number | null;
  movementFormatter: Intl.NumberFormat;
  populationViewFormatter: Intl.NumberFormat;
  movementUnitLabel: string;
  populationUnitLabel: string;
  politicsView: PoliticsView;
  politicsParty: CanonicalPartyId;
  costCategory: CostTargetId;
  populationView: PopulationViewId;
  movementView: MovementTargetId;
  ageGroup: AgeGroupId;
  sex: SexFilter;
  selected: MunicipalityIndexItem | null;
  populationUnit: ReturnType<typeof populationViewUnit>;
  movementUnit: ReturnType<typeof movementTargetUnit>;
} & Pick<
  WorkspaceLabels,
  | "digitalViewLabels"
  | "politicsViewLabels"
  | "politicsPartyLabels"
  | "costCategoryLabels"
  | "costMeasureLabels"
  | "populationViewLabels"
  | "movementLabels"
  | "indicatorLabels"
  | "ageGroupLabels"
> & Pick<
  WorkspaceFormatters,
  | "ratioFormatter"
  | "personsFormatter"
  | "shareFormatter"
  | "currencyFormatter"
  | "signedDecimalFormatter"
>) {
  const chartFormatter =
    metric === "custom" ? ratioFormatter
    : metric === "digital" ? personsFormatter
    : metric === "politics" ? shareFormatter
    : metric === "costs"
      ? costMeasure === "share" || costMeasure === "peer-deviation"
        ? shareFormatter
        : currencyFormatter
      : metric === "movement"
      ? movementFormatter
      : metric === "population"
        ? populationViewFormatter
        : !indicator && ageMeasure === "persons"
          ? personsFormatter
        : indicator && (indicatorUnit === "per-100" || indicatorUnit === "years")
          ? ratioFormatter
          : shareFormatter;
  const chartUnit =
    metric === "custom" ? analysisUnitLabel(customMetric?.unit ?? "", (id) => t(`units.${id}` as "units.persons"))
    : metric === "digital" ? (digitalView === "providers" ? "" : digitalView === "overview" ? t("digitalAreasUnit", { count: activeValue ?? 0 }) : t("digitalPlatformsUnit", { count: activeValue ?? 0 }))
    : metric === "politics" ? ""
    : metric === "costs"
      ? costMeasure === "per-capita" || costMeasure === "real-per-capita"
        ? t("costPerInhabitantUnit")
        : ""
      : metric === "movement"
      ? movementUnitLabel
      : metric === "population"
        ? populationUnitLabel
        : !indicator && ageMeasure === "persons"
          ? t("populationUnit")
        : indicatorUnit === "per-100"
          ? t("per100Persons")
          : indicatorUnit === "years"
            ? t("yearsUnit")
            : "";
  const metricLabel =
    metric === "custom" ? customMetric?.name ?? t("metricCustom")
    : metric === "digital" ? digitalViewLabels[digitalView]
    : metric === "politics" ? politicsView === "party-share" ? `${politicsViewLabels[politicsView]} · ${politicsPartyLabels[politicsParty]}` : politicsViewLabels[politicsView]
    : metric === "costs"
      ? costCategoryLabels[costCategory] + " · " + costMeasureLabels[costMeasure]
      : metric === "population"
      ? populationViewLabels[populationView]
      : metric === "movement"
        ? movementLabels[movementView]
        : indicator
          ? indicatorLabels[indicator]
          : ageGroupLabels[ageGroup] +
            " · " +
            t(
              ageMeasure === "share" ? "ageMeasureShare" : "ageMeasurePersons",
            ) +
            " · " +
            t(
              sex === "female"
                ? "sexFemale"
                : sex === "male"
                  ? "sexMale"
                  : "sexAll",
            );
  const metricChartLabel = selected
    ? metric === "custom" ? t("customChartLabel", { municipality: selected.name, kennzahl: metricLabel })
      : metric === "digital" ? ""
      : metric === "politics" ? ""
      : metric === "costs"
      ? t("costChartLabel", { municipality: selected.name, category: metricLabel })
      : metric === "population"
        ? populationView === "count"
          ? t("populationChartLabel", { municipality: selected.name })
          : t("populationViewChartLabel", { municipality: selected.name, metric: metricLabel })
        : metric === "movement"
          ? t("movementChartLabel", { municipality: selected.name, metric: metricLabel })
          : t("ageChartLabel", { municipality: selected.name, ageGroup: metricLabel })
    : "";
  const analysisDataset: MunicipalityDatasetRef | null = !selected || metric === "politics" || metric === "digital" || metric === "custom"
    ? null
    : metric === "costs"
      ? { kind: "cost-share", municipalityCode: selected.municipalityCode, municipalityName: selected.name, category: costCategory, measure: costMeasure }
      : metric === "population"
      ? { kind: "population", municipalityCode: selected.municipalityCode, municipalityName: selected.name, view: populationView }
      : metric === "movement"
        ? { kind: "movement", municipalityCode: selected.municipalityCode, municipalityName: selected.name, metric: movementView }
        : indicator
          ? { kind: "age-indicator", municipalityCode: selected.municipalityCode, municipalityName: selected.name, indicator }
          : { kind: "age-group", municipalityCode: selected.municipalityCode, municipalityName: selected.name, ageGroup, measure: ageMeasure, sex };
  const formatMetricChange = (
    current: number | null,
    comparison: number | null,
  ) => {
    if (current === null || comparison === null) return "—";
    if (metric === "costs")
      return costMeasure === "share" || costMeasure === "peer-deviation"
        ? signedDecimalFormatter.format((current - comparison) * 100) + " " + t("percentagePoints")
        : formatSigned(current - comparison, currencyFormatter) + " " + t("costPerInhabitantUnit");
    if (metric === "population") {
      if (populationUnit === "share") return signedDecimalFormatter.format((current - comparison) * 100) + " " + t("percentagePoints");
      if (populationUnit === "per-square-kilometer") return signedDecimalFormatter.format(current - comparison) + " " + t("populationDensityUnit");
      return formatSigned(current - comparison, personsFormatter);
    }
    if (metric === "movement")
      return movementUnit === "persons"
        ? formatSigned(current - comparison, personsFormatter)
        : signedDecimalFormatter.format(current - comparison) +
            " " +
            t("per1000Inhabitants");
    if (indicatorUnit === "years") return signedDecimalFormatter.format(current - comparison) + " " + t("yearsUnit");
    if (indicatorUnit === "per-100")
      return (
        signedDecimalFormatter.format(current - comparison) + " " + t("points")
      );
    if (indicatorUnit === "share" || (!indicator && ageMeasure === "share"))
      return (
        signedDecimalFormatter.format((current - comparison) * 100) +
        " " +
        t("percentagePoints")
      );
    return formatSigned(current - comparison, personsFormatter);
  };

  return {
    chartFormatter, chartUnit, metricLabel, metricChartLabel, analysisDataset, formatMetricChange,
  };
}
