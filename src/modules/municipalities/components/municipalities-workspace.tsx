"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPinned } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MUNICIPALITY_COSTS_FIRST_YEAR,
  MUNICIPALITY_COSTS_LATEST_YEAR,
  municipalityCostPerCapita,
  municipalityPopulationBand,
} from "../costs";
import {
  searchMunicipalities,
  type MunicipalityIndexItem,
} from "../data";
import type { MunicipalityMetricRecord } from "../queries";
import { deleteMunicipalityMetric } from "../actions";
import {
  digitalPlatformCostEstimate,
  digitalPlatformMetricValue,
} from "../digital-platforms";
import {
  demographicIndicatorUnit,
  isDemographicIndicatorId,
  datasetDomain,
  symmetricDomain,
  type AgeViewId,
  type MapMetric,
} from "../demography";
import {
  movementTargetPalette,
  movementTargetUnit,
} from "../movement";
import {
  kennzahlExpressionInputs,
  MAP_METRICS_BY_KIND,
  type DataKind,
} from "../kennzahlen";
import {
  POLITICS_FIRST_YEAR,
  POLITICS_LATEST_YEAR,
  electionAsOf,
  politicsMapValue,
} from "../politics";
import {
  MUNICIPALITY_STRUCTURE_FIRST_YEAR,
  MUNICIPALITY_STRUCTURE_LATEST_YEAR,
  populationViewUnit,
  type PopulationViewId,
} from "../structure";
import { createDatasetLookup } from "./municipalities-workspace/dataset-lookup";
import { MunicipalitySearchBox } from "./municipalities-workspace/municipality-search-box";
import { useWorkspaceDatasets } from "./municipalities-workspace/use-workspace-datasets";
import { useWorkspaceFormatters } from "./municipalities-workspace/use-workspace-formatters";
import { useWorkspaceLabels } from "./municipalities-workspace/use-workspace-labels";
import { WorkspaceDetailFacts } from "./municipalities-workspace/workspace-detail-facts";
import { WorkspaceDetailsAside, type WorkspaceDetailsProps } from "./municipalities-workspace/workspace-details-aside";
import { WorkspaceDetailsSheet } from "./municipalities-workspace/workspace-details-sheet";
import { describeWorkspaceMetric } from "./municipalities-workspace/workspace-metric-presentation";
import { useWorkspaceSelection } from "./municipalities-workspace/use-workspace-selection";
import { buildTooltipValues } from "./municipalities-workspace/workspace-tooltip-values";
import { populationBandRange } from "./municipalities-workspace/workspace-utils";

const MunicipalityMap = dynamic(
  () => import("./municipality-map").then((module) => module.MunicipalityMap),
  {
    ssr: false,
    loading: () => (
      <Skeleton className="h-full min-h-[26rem] w-full rounded-2xl" />
    ),
  },
);

export function MunicipalitiesWorkspace({ metrics = [] }: { metrics?: MunicipalityMetricRecord[] }) {
  const t = useTranslations("municipalities");
  const tf = useTranslations("municipalityFilters");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    personsFormatter, shareFormatter, signedShareFormatter, ratioFormatter, dateFormatter,
    currencyFormatter, digitalCostFormatter, signedDecimalFormatter,
  } = useWorkspaceFormatters(locale);
  const paramsRef = useRef(searchParams.toString());
  useEffect(() => {
    paramsRef.current = searchParams.toString();
  }, [searchParams]);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const {
    dataKind, metric, customMetric, populationView, ageView, indicator, ageGroup, ageMeasure, sex,
    movementView, costMeasure, costCategoryOptions, costCategory, politicsView, politicsParty,
    digitalViewOptions, digitalView,
  } = useWorkspaceSelection(searchParams, metrics);
  const selectedCode = searchParams.get("municipality") ?? "";
  const usesCitizenship = metric === "population" && (populationView === "foreign-share" || populationView === "foreign-persons");
  // A user Kennzahl can reach into any data file, so what to fetch follows its
  // Ausgangsdaten rather than the selected category.
  const customInputs = metric === "custom" && customMetric ? kennzahlExpressionInputs(customMetric.expression) : [];
  const needsDemography = metric === "age" || customInputs.some(({ kind }) => kind === "age-group" || kind === "age-indicator");
  const needsMovement = metric === "movement" || customInputs.some(({ kind }) => kind === "movement");
  const needsCosts = metric === "costs" || customInputs.some(({ kind }) => kind === "cost-share");
  const needsStructure = usesCitizenship || customInputs.some((input) => input.kind === "population"
    && (input.view === "foreign-share" || input.view === "foreign-persons" || input.view === "structure-population"));
  const {
    index, populationSeries, demographySeries, movementSeries, structureSeries, costSeries,
    digitalPlatforms, investmentMunicipalityCodes, profiles, currentPolitics, electionHistory,
    politicsError, politicsHistoryRequested, setPoliticsHistoryRequested, loadError,
    demographyError, movementError, structureError, costError, digitalPlatformsError, selected,
  } = useWorkspaceDatasets({
    selectedCode, metric, customMetric, needsDemography, needsMovement, needsCosts, needsStructure,
  });
  const digitalReferenceDate = dateFormatter.format(new Date(`${digitalPlatforms?.referenceDate ?? "2026-08-25"}T00:00:00`));
  const selectedProfile = selected ? (profiles?.profiles[selected.municipalityCode] ?? null) : null;
  const selectedCurrentPolitics = selected ? (currentPolitics?.municipalities[selected.municipalityCode] ?? null) : null;
  const selectedElectionHistory = selected ? (electionHistory?.municipalities[selected.municipalityCode]?.events ?? null) : null;
  const selectedDigitalPlatforms = selected ? (digitalPlatforms?.municipalities[selected.municipalityCode] ?? null) : null;
  const customUsesCosts = customMetric
    ? kennzahlExpressionInputs(customMetric.expression).some(({ kind }) => kind === "cost-share")
    : false;
  const availableFirstYear = metric === "custom" ? (customUsesCosts ? MUNICIPALITY_COSTS_FIRST_YEAR : populationSeries?.firstYear)
    : metric === "digital" ? 2026
    : metric === "politics" ? POLITICS_FIRST_YEAR
    : metric === "costs"
    ? MUNICIPALITY_COSTS_FIRST_YEAR
    : usesCitizenship ? MUNICIPALITY_STRUCTURE_FIRST_YEAR : populationSeries?.firstYear;
  const availableLatestYear = metric === "custom" ? (customUsesCosts ? MUNICIPALITY_COSTS_LATEST_YEAR : populationSeries?.latestYear)
    : metric === "digital" ? 2026
    : metric === "politics" ? POLITICS_LATEST_YEAR
    : metric === "costs"
    ? MUNICIPALITY_COSTS_LATEST_YEAR
    : usesCitizenship ? MUNICIPALITY_STRUCTURE_LATEST_YEAR : populationSeries?.latestYear;
  const year = useMemo(() => {
    if (metric === "digital") return 2026;
    const value = Number(searchParams.get(metric === "politics" ? "politicsYear" : "populationYear"));
    return populationSeries && availableFirstYear !== undefined && availableLatestYear !== undefined &&
      Number.isInteger(value) && value >= availableFirstYear && value <= availableLatestYear
      ? value
      : (availableLatestYear ?? null);
  }, [availableFirstYear, availableLatestYear, metric, populationSeries, searchParams]);
  const populationReferenceYear = year === null || !populationSeries ? null : Math.min(populationSeries.latestYear, Math.max(populationSeries.firstYear, year));
  const activePopulation = populationReferenceYear === null ? null : (populationSeries?.years[String(populationReferenceYear)] ?? null);
  const {
    ageGroupLabels, populationViewLabels, populationViewDefinitions, indicatorLabels,
    indicatorDefinitions, movementLabels, movementDefinitions, costCategoryLabels,
    costMeasureLabels, politicsViewLabels, politicsPartyLabels, digitalViewLabels,
    digitalProviderDescription, formatDigitalCostRange, digitalProviderCostDescription,
    renderDigitalCostMethodology, mapLabels,
  } = useWorkspaceLabels(digitalCostFormatter);
  const results = useMemo(
    () => (index ? searchMunicipalities(index.municipalities, query) : []),
    [index, query],
  );
  // The colour domain belongs to the dataset, not to the displayed year: it is computed
  // once per selection over every year the dataset covers, so dragging the year slider
  // keeps the scale — and therefore the colours — comparable.
  const dataset = useMemo(() => {
    if (!index || !populationSeries) return null;
    if (metric === "digital") {
      const valueFor = (code: string) => digitalPlatformMetricValue(digitalPlatforms?.municipalities[code], digitalView);
      return { valueFor, peerMedianFor: () => null, years: () => [2026], domain: [0, 8] as [number, number] };
    }
    if (metric === "politics") {
      const valueFor = (code: string, targetYear: number) => politicsMapValue(electionAsOf(electionHistory?.municipalities[code]?.events ?? [], targetYear), politicsView, politicsParty);
      return { valueFor, peerMedianFor: () => null, years: () => Array.from({ length: POLITICS_LATEST_YEAR - POLITICS_FIRST_YEAR + 1 }, (_, offset) => POLITICS_FIRST_YEAR + offset), domain: politicsView === "leading-list" ? null : [0, 1] as [number, number] };
    }
    const lookup = createDatasetLookup(
      { metric, populationView, ageView, ageMeasure, sex, movementView, costCategory, costMeasure, customExpression: metric === "custom" ? customMetric?.expression ?? null : null },
      {
        index,
        population: populationSeries,
        structure: structureSeries,
        demography: demographySeries,
        movement: movementSeries,
        costs: costSeries,
        digital: digitalPlatforms,
      },
    );
    const usesPopulationClasses = metric === "population" && populationView === "count";
    if (usesPopulationClasses) return { ...lookup, domain: null };
    const years = lookup.years();
    const values = new Float64Array(years.length * index.municipalities.length);
    let count = 0;
    for (const year of years) {
      for (const { municipalityCode } of index.municipalities) {
        const value = lookup.valueFor(municipalityCode, year);
        if (value !== null && Number.isFinite(value)) values[count++] = value;
      }
    }
    const collected = values.subarray(0, count);
    const diverging = (metric === "movement" && movementTargetPalette(movementView) === "diverging")
      || (metric === "costs" && costMeasure === "peer-deviation");
    return { ...lookup, domain: diverging ? symmetricDomain(collected) : datasetDomain(collected) };
  }, [
    ageMeasure, ageView, costCategory, costMeasure, costSeries, customMetric, demographySeries, index,
    digitalPlatforms, digitalView, electionHistory, metric, movementSeries, movementView, politicsParty, politicsView, populationSeries, populationView, sex, structureSeries,
  ]);

  function replace(next: URLSearchParams) {
    const value = next.toString();
    paramsRef.current = value;
    router.replace(value ? `${pathname}?${value}` : pathname, {
      scroll: false,
    });
  }
  function setParameter(name: string, value: string | null) {
    const next = new URLSearchParams(paramsRef.current);
    if (value === null) next.delete(name);
    else next.set(name, value);
    replace(next);
  }
  function updatePopulationView(view: PopulationViewId) {
    const next = new URLSearchParams(paramsRef.current);
    if (view === "count") next.delete("populationView");
    else next.set("populationView", view);
    if ((view === "foreign-share" || view === "foreign-persons") && (year === null || year < MUNICIPALITY_STRUCTURE_FIRST_YEAR || year > MUNICIPALITY_STRUCTURE_LATEST_YEAR)) {
      next.set("populationYear", String(MUNICIPALITY_STRUCTURE_LATEST_YEAR));
    }
    replace(next);
  }
  function updateAgeView(view: AgeViewId) {
    const next = new URLSearchParams(paramsRef.current);
    if (isDemographicIndicatorId(view)) {
      next.set("ageIndicator", view);
      next.delete("ageGroup");
      next.delete("ageMeasure");
      next.delete("sex");
    } else {
      next.set("ageGroup", view);
      next.delete("ageIndicator");
    }
    replace(next);
  }
  function updateDataKind(kind: DataKind) {
    const next = new URLSearchParams(paramsRef.current);
    if (kind === "base") next.delete("dataKind");
    else next.set("dataKind", kind);
    // The view parameters name Ausgangsdaten or Kennzahlen, never both, so they are
    // dropped and each category falls back to the first view of the new Datenart.
    for (const name of ["populationView", "ageGroup", "ageIndicator", "ageMeasure", "movementMetric", "costMeasure", "costCategory", "politicsView", "digitalView"]) {
      next.delete(name);
    }
    if (!MAP_METRICS_BY_KIND[kind].includes(metric)) next.delete("metric");
    replace(next);
  }
  function updateMetric(value: MapMetric) {
    const next = new URLSearchParams(paramsRef.current);
    if (value === "population") next.delete("metric");
    else next.set("metric", value);
    if (value === "costs" && (year === null || year < MUNICIPALITY_COSTS_FIRST_YEAR || year > MUNICIPALITY_COSTS_LATEST_YEAR)) {
      next.set("populationYear", String(MUNICIPALITY_COSTS_LATEST_YEAR));
    }
    replace(next);
  }
  function updateSelection(item: MunicipalityIndexItem | null) {
    setParameter("municipality", item?.municipalityCode ?? null);
    setSearchOpen(false);
    setQuery(item?.name ?? "");
  }
  function selectByCode(code: string) {
    const item = index?.municipalities.find(
      ({ municipalityCode }) => municipalityCode === code,
    );
    if (item) updateSelection(item);
  }

  if (loadError)
    return (
      <div
        className="grid min-h-[34rem] place-items-center rounded-2xl border border-dashed bg-muted/20 p-8 text-center"
        role="alert"
      >
        <div>
          <MapPinned className="mx-auto mb-3 size-9 text-muted-foreground" />
          <p className="font-semibold">{t("loadErrorTitle")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("loadErrorDescription")}
          </p>
        </div>
      </div>
    );
  if (!index || !populationSeries || !activePopulation || year === null)
    return (
      <Skeleton className="h-[calc(100dvh-12rem)] min-h-[34rem] w-full rounded-2xl" />
    );

  const valueFor = dataset!.valueFor;
  const activeDemography = demographySeries?.years[String(year)] ?? null;
  const activeMovement = movementSeries?.years[String(year)] ?? null;
  const activeCosts = costSeries?.years[String(year)] ?? null;
  const populationUnit = populationViewUnit(populationView);
  const populationViewFormatter =
    populationUnit === "persons" ? personsFormatter : populationUnit === "share" ? shareFormatter : ratioFormatter;
  const populationUnitLabel =
    populationUnit === "persons" ? t("populationUnit") : populationUnit === "share" ? "" : t("populationDensityUnit");
  const movementUnit = movementTargetUnit(movementView);
  const movementFormatter =
    movementUnit === "persons" ? personsFormatter : ratioFormatter;
  const movementUnitLabel =
    movementUnit === "persons" ? t("populationUnit") : t("per1000Inhabitants");
  const selectedPeerGroup = (() => {
    if (metric !== "costs" || costMeasure !== "peer-deviation" || !selected || !activeCosts) return null;
    const selectedPopulation = populationSeries.years[String(year)].values[selected.municipalityCode];
    if (!selectedPopulation) return null;
    const band = municipalityPopulationBand(selectedPopulation);
    const peers = index.municipalities.flatMap((municipality) => {
      const population = populationSeries.years[String(year)].values[municipality.municipalityCode];
      const costs = activeCosts.values[municipality.municipalityCode];
      if (!population || !costs || municipalityPopulationBand(population) !== band) return [];
      return municipalityCostPerCapita(costs, costCategory, population) === null ? [] : [municipality];
    });
    const regionalPeers = peers.filter((municipality) => municipality.state === selected.state);
    const comparison = regionalPeers.length >= 5 ? regionalPeers : peers;
    if (!comparison.length) return null;
    return {
      municipalityCodes: comparison.map((municipality) => municipality.municipalityCode),
      label: t("peerComparisonGroup", {
        count: comparison.length,
        scope: regionalPeers.length >= 5 ? selected.state : t("allAustria"),
        range: populationBandRange(selectedPopulation, personsFormatter),
      }),
    };
  })();

  const metricValues: Record<string, number | null> = Object.fromEntries(
    index.municipalities.map(({ municipalityCode }) => [
      municipalityCode,
      valueFor(municipalityCode, year),
    ]),
  );
  const indicatorUnit = indicator ? demographicIndicatorUnit(indicator) : null;
  const indicatorFormatter =
    indicatorUnit === "share" ? shareFormatter : ratioFormatter;
  const indicatorUnitLabel =
    indicatorUnit === "per-100" ? t("per100Persons") : indicatorUnit === "years" ? t("yearsUnit") : "";
  const tooltipValues = buildTooltipValues({
    metric, index, metricValues, digitalView, digitalPlatforms, activePopulation, t,
    populationView, populationViewFormatter, populationUnitLabel, activeDemography, indicator,
    indicatorFormatter, indicatorUnitLabel, sex, ageGroup, activeMovement, valueFor, year,
    movementView, movementFormatter, movementUnitLabel, activeCosts, costCategory, costMeasure,
    electionHistory, politicsView, politicsParty, digitalProviderDescription,
    digitalProviderCostDescription, digitalViewLabels, populationViewLabels, indicatorLabels,
    ageGroupLabels, movementLabels, costCategoryLabels, costMeasureLabels, politicsViewLabels,
    politicsPartyLabels, personsFormatter, shareFormatter, currencyFormatter,
  });
  const selectedPopulation = selected
    ? usesCitizenship
      ? (structureSeries?.years[String(year)]?.values[selected.municipalityCode]?.[0] ?? activePopulation.values[selected.municipalityCode])
      : activePopulation.values[selected.municipalityCode]
    : 0;
  const selectedDigitalCostEstimate = selectedDigitalPlatforms && selectedPopulation
    ? digitalPlatformCostEstimate(selectedDigitalPlatforms, selectedPopulation)
    : null;
  const previousYear = year > availableFirstYear! ? year - 1 : null;
  const activeValue = selected
    ? (metricValues[selected.municipalityCode] ?? null)
    : null;
  const metricValueForYear = (targetYear: number) =>
    selected ? valueFor(selected.municipalityCode, targetYear) : null;
  const previousValue =
    metric === "politics" || metric === "digital" || previousYear === null ? null : metricValueForYear(previousYear);
  const firstValue = metricValueForYear(availableFirstYear!);
  const historyAvailable =
    (metric === "population" && (!usesCitizenship || structureSeries)) ||
    (metric === "age" && demographySeries) ||
    (metric === "movement" && movementSeries) ||
    (metric === "costs" && costSeries) ||
    (metric === "custom"
      && (!needsDemography || demographySeries) && (!needsMovement || movementSeries)
      && (!needsCosts || costSeries) && (!needsStructure || structureSeries));
  const history =
    selected && historyAvailable
      ? Array.from({ length: availableLatestYear! - availableFirstYear! + 1 }, (_, offset) => availableFirstYear! + offset).map((historyYear) => ({
          year: historyYear,
          value: metricValueForYear(historyYear),
        }))
      : null;
  const {
    chartFormatter, chartUnit, metricLabel, metricChartLabel, analysisDataset, formatMetricChange,
  } = describeWorkspaceMetric({
    metric, t, costMeasure, indicator, indicatorUnit, ageMeasure, customMetric, digitalView,
    activeValue, movementFormatter, populationViewFormatter, movementUnitLabel,
    populationUnitLabel, politicsView, politicsParty, costCategory, populationView, movementView,
    ageGroup, sex, selected, populationUnit, movementUnit, digitalViewLabels, politicsViewLabels,
    politicsPartyLabels, costCategoryLabels, costMeasureLabels, populationViewLabels,
    movementLabels, indicatorLabels, ageGroupLabels, ratioFormatter, personsFormatter,
    shareFormatter, currencyFormatter, signedDecimalFormatter,
  });
  const scaleDomain = dataset!.domain;
  const averageAnnualPopulationChange =
    metric === "population" && populationView === "count" &&
    firstValue &&
    activeValue &&
    year > populationSeries.firstYear
      ? Math.pow(
          activeValue / firstValue,
          1 / (year - populationSeries.firstYear),
        ) - 1
      : null;

  const detailFacts = selected ? (
    <WorkspaceDetailFacts
      selected={selected}
      selectedProfile={selectedProfile}
      selectedPopulation={selectedPopulation}
      metric={metric}
      digitalView={digitalView}
      populationView={populationView}
      metricLabel={metricLabel}
      selectedDigitalPlatforms={selectedDigitalPlatforms}
      selectedDigitalCostEstimate={selectedDigitalCostEstimate}
      activeValue={activeValue}
      previousValue={previousValue}
      averageAnnualPopulationChange={averageAnnualPopulationChange}
      chartFormatter={chartFormatter}
      chartUnit={chartUnit}
      formatMetricChange={formatMetricChange}
      populationSeries={populationSeries}
      personsFormatter={personsFormatter}
      ratioFormatter={ratioFormatter}
      signedShareFormatter={signedShareFormatter}
      digitalProviderDescription={digitalProviderDescription}
      formatDigitalCostRange={formatDigitalCostRange}
    />
  ) : null;
  const detailsProps: WorkspaceDetailsProps = {
    selected, detailFacts, metric, digitalView, renderDigitalCostMethodology,
    selectedDigitalPlatforms, digitalPlatforms, selectedCurrentPolitics, currentPolitics,
    selectedElectionHistory, electionHistory, politicsHistoryRequested, politicsError,
    setPoliticsHistoryRequested, digitalReferenceDate, year, usesCitizenship,
    investmentMunicipalityCodes, updateSelection, index, populationSeries,
  };

  return (
    <div
      className="grid min-h-0 gap-0 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-4"
      data-testid="municipalities-workspace"
    >
      {metric === "custom" && customInputs.some(input => input.kind === "condition") && <p className="col-span-full mb-3 rounded-lg border bg-muted/30 p-3 text-xs">{tf("snapshotHint")} {digitalPlatforms && tf("snapshotDate", { date: digitalPlatforms.referenceDate })}</p>}
      <section
        className="relative h-[calc(100dvh-10.5rem)] min-h-[32rem] lg:h-[calc(100dvh-12rem)] lg:min-h-[38rem]"
        aria-label={t("mapRegionLabel")}
      >
        <MunicipalitySearchBox
          query={query}
          setQuery={setQuery}
          searchOpen={searchOpen}
          setSearchOpen={setSearchOpen}
          activeResult={activeResult}
          setActiveResult={setActiveResult}
          results={results}
          updateSelection={updateSelection}
        />
        <MunicipalityMap
          austriaBounds={index.bounds}
          selected={selected}
          metric={metric}
          populationView={populationView}
          populationDefinition={populationViewDefinitions[populationView] ?? null}
          usePopulationClasses={metric === "population" && populationView === "count"}
          metricValues={metricValues}
          tooltipValues={tooltipValues}
          scaleDomain={scaleDomain}
          movementPalette={
            metric === "movement" ? movementTargetPalette(movementView) : null
          }
          year={year}
          firstYear={availableFirstYear!}
          latestYear={availableLatestYear!}
          ageView={ageView}
          sex={sex}
          movementView={movementView}
          costCategory={costCategory}
          costMeasure={costMeasure}
          politicsView={politicsView}
          politicsParty={politicsParty}
          digitalView={digitalView}
          customView={customMetric?.id ?? ""}
          peerMunicipalityCodes={selectedPeerGroup?.municipalityCodes ?? null}
          peerGroupLabel={selectedPeerGroup?.label ?? null}
          movementDefinition={movementDefinitions[movementView] ?? null}
          showAgeFilters={!indicator}
          indicatorDefinition={
            indicator ? indicatorDefinitions[indicator] : null
          }
          ageLoading={needsDemography && !demographySeries && !demographyError}
          ageError={demographyError}
          movementLoading={
            needsMovement && !movementSeries && !movementError
          }
          movementError={movementError}
          costsLoading={needsCosts && !costSeries && !costError}
          costsError={costError}
          politicsLoading={metric === "politics" && !electionHistory && !politicsError}
          politicsError={politicsError}
          digitalLoading={metric === "digital" && !digitalPlatforms && !digitalPlatformsError}
          digitalError={digitalPlatformsError}
          structureLoading={needsStructure && !structureSeries && !structureError}
          structureError={structureError}
          onYearChange={(value) =>
            setParameter(metric === "politics" ? "politicsYear" : "populationYear", String(value))
          }
          dataKind={dataKind}
          onDataKindChange={updateDataKind}
          onMetricChange={updateMetric}
          onPopulationViewChange={updatePopulationView}
          onAgeViewChange={updateAgeView}
          onSexChange={(value) => setParameter("sex", value)}
          onMovementViewChange={(value) =>
            setParameter("movementMetric", value)
          }
          onCostCategoryChange={(value) => setParameter("costCategory", value === "0" ? null : value)}
          onCostMeasureChange={(value) => setParameter("costMeasure", value === "share" ? null : value)}
          onPoliticsViewChange={(value) => setParameter("politicsView", value === "leading-list" ? null : value)}
          onPoliticsPartyChange={(value) => setParameter("politicsParty", value === "oevp" ? null : value)}
          onDigitalViewChange={(value) => setParameter("digitalView", value === "overview" ? null : value)}
          onCustomViewChange={(value) => setParameter("customMetric", value)}
          onCustomDelete={(id) => {
            void deleteMunicipalityMetric(id).then(() => {
              setParameter("customMetric", null);
              router.refresh();
            });
          }}
          onSelect={selectByCode}
          onReset={() => updateSelection(null)}
          onOpenDetails={() => setDetailsOpen(true)}
          labels={mapLabels({
            metric, year, digitalReferenceDate, usesCitizenship, dataKind, digitalViewOptions,
            metrics, customMetric, digitalView, costCategoryOptions, costMeasure,
          })}
          selectedMetricHistory={history}
          metricChartLabel={metricChartLabel}
          metricLabel={metricLabel}
          chartValueFormatter={chartFormatter}
          chartUnitLabel={chartUnit}
          chartChangeLabels={metric === "population" && populationView === "count" ? { previousYear: t("populationChangePreviousYear"), sinceFirstYear: t("populationChangeSinceFirstYear", { year: populationSeries.firstYear }) } : undefined}
          analysisDataset={analysisDataset}
          showMetricChart={Boolean(analysisDataset) || metric === "custom"}
        />
      </section>
      <WorkspaceDetailsAside
        {...detailsProps}
        demographySeries={demographySeries}
        structureSeries={structureSeries}
        movementSeries={movementSeries}
        costSeries={costSeries}
        costMeasure={costMeasure}
      />

      <WorkspaceDetailsSheet
        {...detailsProps}
        detailsOpen={detailsOpen}
        setDetailsOpen={setDetailsOpen}
        history={history}
        analysisDataset={analysisDataset}
        metricLabel={metricLabel}
        chartFormatter={chartFormatter}
        chartUnit={chartUnit}
        populationView={populationView}
        metricChartLabel={metricChartLabel}
      />
    </div>
  );
}
