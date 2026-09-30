"use client";

// Translated label records of the municipalities workspace, the digital-platform descriptions and the
// label set handed to MunicipalityMap. Used by municipalities-workspace.tsx and its extracted pieces.
import { useTranslations } from "next-intl";
import {
  COST_CATEGORIES,
  type CostCategoryId,
  type CostMeasureId,
  type CostTargetId,
} from "../../costs";
import {
  digitalPlatformCostEstimate,
  digitalPlatformProviderClassification,
  type DigitalPlatformProviderCategory,
  type DigitalPlatformViewId,
  type MunicipalityDigitalPlatformProfile,
} from "../../digital-platforms";
import {
  isAgeGroupId,
  isDemographicIndicatorId,
  type AgeGroupId,
  type DemographicIndicatorId,
  type MapMetric,
} from "../../demography";
import type { MovementTargetId } from "../../movement";
import {
  AGE_VIEWS_BY_KIND,
  COST_MEASURES_BY_KIND,
  MAP_METRICS_BY_KIND,
  MOVEMENT_VIEWS_BY_KIND,
  POLITICS_VIEWS_BY_KIND,
  POPULATION_VIEWS_BY_KIND,
  type DataKind,
} from "../../kennzahlen";
import { CANONICAL_PARTIES, type CanonicalPartyId, type PoliticsView } from "../../politics";
import type { MunicipalityMetricRecord } from "../../queries";
import type { PopulationViewId } from "../../structure";
import type { Labels as MunicipalityMapLabels } from "../municipality-map/map-types";
import { pick } from "./workspace-utils";

export function useWorkspaceLabels(digitalCostFormatter: Intl.NumberFormat) {
  const t = useTranslations("municipalities");
  const ageGroupLabels: Record<AgeGroupId, string> = {
    "0-5": t("ageGroup0-5"),
    "6-14": t("ageGroup6-14"),
    "15-24": t("ageGroup15-24"),
    "25-44": t("ageGroup25-44"),
    "45-64": t("ageGroup45-64"),
    "65-79": t("ageGroup65-79"),
    "80-plus": t("ageGroup80-plus"),
  };
  const populationViewLabels: Record<PopulationViewId, string> = {
    count: t("populationCount"),
    density: t("populationDensity"),
    "foreign-share": t("populationForeignShare"),
    "foreign-persons": t("populationForeignPersons"),
    "structure-population": t("populationStructurePopulation"),
  };
  const populationViewDefinitions: Partial<Record<PopulationViewId, string>> = {
    density: t("populationDensityDefinition"),
    "foreign-share": t("populationForeignShareDefinition"),
    "foreign-persons": t("populationForeignPersonsDefinition"),
    "structure-population": t("populationStructurePopulationDefinition"),
  };
  const indicatorLabels: Record<DemographicIndicatorId, string> = {
    "youth-share": t("indicatorYouthShare"),
    "senior-share": t("indicatorSeniorShare"),
    "old-age-dependency": t("indicatorOldAgeDependency"),
    "child-dependency": t("indicatorChildDependency"),
    "total-dependency": t("indicatorTotalDependency"),
    "aging-index": t("indicatorAgingIndex"),
    "average-age": t("indicatorAverageAge"),
    "women-share": t("indicatorWomenShare"),
    "women-per-100-men": t("indicatorWomenPer100Men"),
  };
  const indicatorDefinitions: Record<DemographicIndicatorId, string> = {
    "youth-share": t("indicatorYouthShareDefinition"),
    "senior-share": t("indicatorSeniorShareDefinition"),
    "old-age-dependency": t("indicatorOldAgeDependencyDefinition"),
    "child-dependency": t("indicatorChildDependencyDefinition"),
    "total-dependency": t("indicatorTotalDependencyDefinition"),
    "aging-index": t("indicatorAgingIndexDefinition"),
    "average-age": t("indicatorAverageAgeDefinition"),
    "women-share": t("indicatorWomenShareDefinition"),
    "women-per-100-men": t("indicatorWomenPer100MenDefinition"),
  };
  const metricLabels: Record<MapMetric, string> = {
    custom: t("metricCustom"),
    population: t("metricPopulation"),
    age: t("metricAge"),
    movement: t("metricMovement"),
    costs: t("metricCosts"),
    politics: t("metricPolitics"),
    digital: t("metricDigital"),
  };
  const movementLabels: Record<MovementTargetId, string> = {
    "population-change": t("movementPopulationChange"),
    births: t("movementBirths"),
    deaths: t("movementDeaths"),
    "birth-rate": t("movementBirthRate"),
    "death-rate": t("movementDeathRate"),
    "birth-balance-rate": t("movementBirthBalanceRate"),
    arrivals: t("movementArrivals"),
    departures: t("movementDepartures"),
    "migration-balance-rate": t("movementMigrationBalanceRate"),
    "international-migration-balance": t("movementInternationalBalance"),
    "international-migration-balance-rate": t("movementInternationalBalanceRate"),
    "internal-migration-balance": t("movementInternalBalance"),
    "internal-migration-balance-rate": t("movementInternalBalanceRate"),
    "statistical-correction": t("movementStatisticalCorrection"),
    "international-arrivals": t("movementInternationalArrivals"),
    "international-departures": t("movementInternationalDepartures"),
    "internal-arrivals": t("movementInternalArrivals"),
    "internal-departures": t("movementInternalDepartures"),
  };
  const movementDefinitions: Partial<Record<MovementTargetId, string>> = {
    "population-change": t("movementPopulationChangeDefinition"),
    "birth-rate": t("movementBirthRateDefinition"),
    "death-rate": t("movementDeathRateDefinition"),
    "birth-balance-rate": t("movementBirthBalanceRateDefinition"),
    "migration-balance-rate": t("movementMigrationBalanceRateDefinition"),
    "international-migration-balance": t("movementInternationalBalanceDefinition"),
    "international-migration-balance-rate": t("movementInternationalBalanceRateDefinition"),
    "internal-migration-balance": t("movementInternalBalanceDefinition"),
    "internal-migration-balance-rate": t("movementInternalBalanceRateDefinition"),
    "statistical-correction": t("movementStatisticalCorrectionDefinition"),
    "international-arrivals": t("movementInternationalArrivalsDefinition"),
    "international-departures": t("movementInternationalDeparturesDefinition"),
    "internal-arrivals": t("movementInternalArrivalsDefinition"),
    "internal-departures": t("movementInternalDeparturesDefinition"),
  };
  const costCategoryLabels: Record<CostTargetId, string> = {
    ...Object.fromEntries(
      COST_CATEGORIES.map(({ id }) => [id, t(`costCategory${id}` as "costCategory0")]),
    ) as Record<CostCategoryId, string>,
    total: t("costCategoryTotal"),
  };
  const costMeasureLabels: Record<CostMeasureId, string> = {
    absolute: t("costMeasureAbsolute"),
    share: t("costMeasureShare"),
    "per-capita": t("costMeasurePerCapita"),
    "real-per-capita": t("costMeasureRealPerCapita"),
    "peer-deviation": t("costMeasurePeerDeviation"),
  };
  const politicsViewLabels: Record<PoliticsView, string> = {
    "leading-list": t("politicsViewLeadingList"),
    "party-share": t("politicsViewPartyShare"),
    turnout: t("politicsViewTurnout"),
  };
  const politicsPartyLabels = Object.fromEntries(CANONICAL_PARTIES.map((party) => [party, t(`politicsParty${party}` as "politicsPartyoevp")])) as Record<CanonicalPartyId, string>;
  const digitalViewLabels: Record<DigitalPlatformViewId, string> = {
    overview: t("digitalViewOverview"),
    providers: t("digitalViewProviders"),
    "citizen-app": t("digitalViewCitizenApp"),
    "service-portal": t("digitalViewServicePortal"),
    "digital-notice-board": t("digitalViewNoticeBoard"),
    "website-cms": t("digitalViewWebsiteCms"),
    "waste-platform": t("digitalViewWastePlatform"),
    "appointment-booking": t("digitalViewAppointmentBooking"),
    participation: t("digitalViewParticipation"),
    communication: t("digitalViewCommunication"),
    "open-data": t("digitalViewOpenData"),
    other: t("digitalViewOther"),
  };
  const digitalProviderLabels: Record<DigitalPlatformProviderCategory, string> = {
    none: t("digitalProviderNone"),
    gem2go: "GEM2GO",
    cities: "CITIES",
    gemeinde24: "Gemeinde24",
    gemeindeapp: "GemeindeApp",
    "daheim-app": "Daheim App",
    "local-app": t("digitalProviderLocal"),
    multiple: t("digitalProviderMultiple"),
  };
  const digitalProviderDescription = (
    profile: MunicipalityDigitalPlatformProfile | undefined,
  ) => {
    if (!profile) return t("digitalCoverageUnknown");
    const classification = digitalPlatformProviderClassification(profile);
    if (!classification) return t("digitalCoverageUnknown");
    if (classification.category !== "multiple") {
      return digitalProviderLabels[classification.category];
    }
    return `${digitalProviderLabels.multiple} · ${classification.providers
      .map((provider) => digitalProviderLabels[provider]).join(", ")}`;
  };
  const formatDigitalCostRange = (range: readonly [number, number]) =>
    range[0] === range[1]
      ? digitalCostFormatter.format(range[0])
      : `${digitalCostFormatter.format(range[0])}–${digitalCostFormatter.format(range[1])}`;
  const digitalProviderCostDescription = (
    profile: MunicipalityDigitalPlatformProfile | undefined,
    population: number | undefined,
  ) => {
    if (!profile || !population) return t("digitalCostUnavailable");
    const estimate = digitalPlatformCostEstimate(profile, population);
    if (!estimate) return t("digitalCostUnavailable");
    if (estimate.annualEuros[0] === 0 && estimate.annualEuros[1] === 0) {
      return t("digitalCostNoApp");
    }
    return t("digitalCostAnnualShort", { range: formatDigitalCostRange(estimate.annualEuros) });
  };
  const renderDigitalCostMethodology = () => (
    <p className="mt-3 text-[11px] leading-4 text-muted-foreground" data-testid="digital-cost-methodology">
      {t("digitalCostMethodology")} {t("digitalCostSources")}:{" "}
      <a className="text-teal-700 underline underline-offset-2 dark:text-teal-300" href="https://cdn.citiesapps.com/pages/f8f520c0e306b26e1627e156/page-file-system/1706179605834_NiederschriftGR16.06.2023.pdf" target="_blank" rel="noreferrer">{t("digitalCostPublicOffers")}</a>,{" "}
      <a className="text-teal-700 underline underline-offset-2 dark:text-teal-300" href="https://citiesapps.com/help-center/faq/faq-cities-und-municipalities" target="_blank" rel="noreferrer">CITIES</a>,{" "}
      <a className="text-teal-700 underline underline-offset-2 dark:text-teal-300" href="https://gemeindeapp.at/faq/" target="_blank" rel="noreferrer">GemeindeApp</a>,{" "}
      <a className="text-teal-700 underline underline-offset-2 dark:text-teal-300" href="https://daheim-app.at/" target="_blank" rel="noreferrer">Daheim App</a>.
    </p>
  );
  const costMeasureDefinitions: Record<CostMeasureId, string> = {
    absolute: t("costMeasureAbsoluteDefinition"),
    share: t("costMeasureShareDefinition"),
    "per-capita": t("costMeasurePerCapitaDefinition"),
    "real-per-capita": t("costMeasureRealPerCapitaDefinition"),
    "peer-deviation": t("costMeasurePeerDeviationDefinition"),
  };
  /** The label set MunicipalityMap needs for the current selection. */
  const mapLabels = ({
    metric, year, digitalReferenceDate, usesCitizenship, dataKind, digitalViewOptions, metrics,
    customMetric, digitalView, costCategoryOptions, costMeasure,
  }: {
    metric: MapMetric;
    year: number;
    digitalReferenceDate: string;
    usesCitizenship: boolean;
    dataKind: DataKind;
    digitalViewOptions: readonly DigitalPlatformViewId[];
    metrics: MunicipalityMetricRecord[];
    customMetric: MunicipalityMetricRecord | null;
    digitalView: DigitalPlatformViewId;
    costCategoryOptions: readonly CostTargetId[];
    costMeasure: CostMeasureId;
  }): MunicipalityMapLabels => ({
    map: t("mapLabel"),
    zoomIn: t("zoomIn"),
    zoomOut: t("zoomOut"),
    reset: t("allAustria"),
    municipalityCode: t("municipalityCode"),
    population: t("population"),
    reference:
      metric === "custom" ? t("customReference", { year })
      : metric === "digital" ? t("digitalReference", { date: digitalReferenceDate })
      : metric === "politics" ? t("politicsReference", { year })
      : metric === "costs"
        ? t("costReference", { year })
        : metric === "movement"
        ? t("movementReference", { year })
        : usesCitizenship
          ? t("structureReference", { year })
          : t("populationReference", { year }),
    year: t("populationYear"),
    previousYear: t("previousPopulationYear"),
    nextYear: t("nextPopulationYear"),
    metric: t("metric"),
    dataKind: t("dataKind"),
    dataKinds: { base: t("dataKindBase"), derived: t("dataKindDerived") },
    metrics: pick(metricLabels, MAP_METRICS_BY_KIND[dataKind]),
    digitalView: t("digitalView"),
    digitalViews: pick(digitalViewLabels, digitalViewOptions),
    customView: t("customView"),
    customViews: Object.fromEntries(metrics.map(({ id, name }) => [id, name])),
    customDelete: t("customDelete"),
    customDeleteConfirm: t("customDeleteConfirm", { name: customMetric?.name ?? "" }),
    digitalProviderLabels,
    digitalDefinition: t(digitalView === "providers" ? "digitalProviderDefinition" : "digitalDefinition"),
    digitalNoneFound: t("digitalNoneFound"),
    digitalLegendOne: t("digitalLegendOne"),
    digitalLegendTwo: t("digitalLegendTwo"),
    digitalLegendThreeToFour: t("digitalLegendThreeToFour"),
    digitalLegendFiveToSeven: t("digitalLegendFiveToSeven"),
    digitalLegendEightPlus: t("digitalLegendEightPlus"),
    politicsView: t("politicsView"),
    politicsViews: pick(politicsViewLabels, POLITICS_VIEWS_BY_KIND[dataKind]),
    politicsParty: t("politicsParty"),
    politicsParties: politicsPartyLabels,
    politicsTie: t("politicsTie"),
    populationView: t("populationView"),
    populationViews: pick(populationViewLabels, POPULATION_VIEWS_BY_KIND[dataKind]),
    ageView: t("ageView"),
    movementView: t("movementView"),
    ageGroupsHeading: t("ageGroupsHeading"),
    indicatorsHeading: t("indicatorsHeading"),
    ageGroups: pick(ageGroupLabels, AGE_VIEWS_BY_KIND[dataKind].filter(isAgeGroupId)),
    indicators: pick(indicatorLabels, AGE_VIEWS_BY_KIND[dataKind].filter(isDemographicIndicatorId)),
    movements: pick(movementLabels, MOVEMENT_VIEWS_BY_KIND[dataKind]),
    costView: t("costView"),
    costCategories: pick(costCategoryLabels, costCategoryOptions),
    costMeasure: t("costMeasure"),
    costMeasures: pick(costMeasureLabels, COST_MEASURES_BY_KIND[dataKind]),
    costDefinition: costMeasureDefinitions[costMeasure],
    sexes: {
      all: t("sexAll"),
      female: t("sexFemale"),
      male: t("sexMale"),
    },
    minimizeChart: t("minimizeMetricChart"),
    expandChart: t("expandMetricChart"),
    restoreChart: t("restoreMetricChart"),
    loadingAge: t("ageLayerLoading"),
    ageError: t("ageLayerError"),
    loadingMovement: t("movementLayerLoading"),
    movementError: t("movementLayerError"),
    loadingCosts: t("costLayerLoading"),
    costsError: t("costLayerError"),
    loadingPolitics: t("politicsLayerLoading"),
    politicsError: t("politicsLayerError"),
    loadingDigital: t("digitalLayerLoading"),
    digitalError: t("digitalLayerError"),
    loadingStructure: t("structureLayerLoading"),
    structureError: t("structureLayerError"),
    addToAnalysis: t("addToAnalysis"),
    dragToAnalysis: t("dragToAnalysis"),
    noData: t("mapNoData"),
    zoomHintWindows: t("mapZoomHintWindows"),
    zoomHintMac: t("mapZoomHintMac"),
    zoomHintMobile: t("mapZoomHintMobile"),
    display: t("mobileDisplay"),
    legend: t("mobileLegend"),
    details: t("mobileDetails"),
    close: t("mobileClose"),
    selected: t("mobileSelected"),
  });

  return {
    ageGroupLabels, populationViewLabels, populationViewDefinitions, indicatorLabels,
    indicatorDefinitions, movementLabels, movementDefinitions, costCategoryLabels,
    costMeasureLabels, politicsViewLabels, politicsPartyLabels, digitalViewLabels,
    digitalProviderDescription, formatDigitalCostRange, digitalProviderCostDescription,
    renderDigitalCostMethodology, mapLabels,
  };
}

export type WorkspaceLabels = ReturnType<typeof useWorkspaceLabels>;
