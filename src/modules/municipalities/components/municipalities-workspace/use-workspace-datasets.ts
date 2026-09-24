"use client";

// Fetches and validates the municipality data files the workspace needs: the index and population up front,
// everything else lazily once the selection asks for it. Used by municipalities-workspace.tsx.
import { useEffect, useMemo, useState } from "react";
import { validateMunicipalityCostSeries, type MunicipalityCostSeries } from "../../costs";
import { validateMunicipalityIndex, type MunicipalityIndex } from "../../data";
import {
  validateMunicipalityDigitalPlatformDataset,
  type MunicipalityDigitalPlatformDataset,
} from "../../digital-platforms";
import {
  validateMunicipalityDemographySeries,
  type MapMetric,
  type MunicipalityDemographySeries,
} from "../../demography";
import type { MunicipalityInvestmentIndex } from "../../investments";
import { kennzahlExpressionInputs } from "../../kennzahlen";
import {
  validateMunicipalityMovementSeries,
  type MunicipalityMovementSeries,
} from "../../movement";
import {
  validateMunicipalityCurrentPolitics,
  validateMunicipalityElectionHistory,
  type MunicipalityCurrentPoliticsDataset,
  type MunicipalityElectionHistoryDataset,
} from "../../politics";
import {
  validateMunicipalityPopulationSeries,
  type MunicipalityPopulationSeries,
} from "../../population";
import type { MunicipalityMetricRecord } from "../../queries";
import {
  validateMunicipalityStructureSeries,
  type MunicipalityStructureSeries,
} from "../../structure";
import { fetchJson, type MunicipalityProfileDataset } from "./workspace-utils";

export function useWorkspaceDatasets({
  selectedCode, metric, customMetric, needsDemography, needsMovement, needsCosts, needsStructure,
}: {
  selectedCode: string;
  metric: MapMetric;
  customMetric: MunicipalityMetricRecord | null;
  needsDemography: boolean;
  needsMovement: boolean;
  needsCosts: boolean;
  needsStructure: boolean;
}) {
  const [index, setIndex] = useState<MunicipalityIndex | null>(null);
  const [populationSeries, setPopulationSeries] =
    useState<MunicipalityPopulationSeries | null>(null);
  const [demographySeries, setDemographySeries] =
    useState<MunicipalityDemographySeries | null>(null);
  const [movementSeries, setMovementSeries] =
    useState<MunicipalityMovementSeries | null>(null);
  const [structureSeries, setStructureSeries] =
    useState<MunicipalityStructureSeries | null>(null);
  const [costSeries, setCostSeries] = useState<MunicipalityCostSeries | null>(null);
  const [digitalPlatforms, setDigitalPlatforms] = useState<MunicipalityDigitalPlatformDataset | null>(null);
  const [investmentMunicipalityCodes, setInvestmentMunicipalityCodes] = useState<Set<string> | null>(null);
  const [profiles, setProfiles] = useState<MunicipalityProfileDataset | null>(null);
  const [currentPolitics, setCurrentPolitics] = useState<MunicipalityCurrentPoliticsDataset | null>(null);
  const [electionHistory, setElectionHistory] = useState<MunicipalityElectionHistoryDataset | null>(null);
  const [politicsError, setPoliticsError] = useState(false);
  const [politicsHistoryRequested, setPoliticsHistoryRequested] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [demographyError, setDemographyError] = useState(false);
  const [movementError, setMovementError] = useState(false);
  const [structureError, setStructureError] = useState(false);
  const [costError, setCostError] = useState(false);
  const [digitalPlatformsError, setDigitalPlatformsError] = useState(false);
  const selected = useMemo(
    () =>
      index?.municipalities.find(
        (item) => item.municipalityCode === selectedCode,
      ) ?? null,
    [index, selectedCode],
  );

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchJson<MunicipalityIndex>(
        "/data/municipalities-at-2026.index.json",
        controller.signal,
      ),
      fetchJson<MunicipalityPopulationSeries>(
        "/data/municipality-population-2002-2025.json",
        controller.signal,
      ),
    ])
      .then(([indexData, populationData]) => {
        const validIndex = validateMunicipalityIndex(indexData);
        setIndex(validIndex);
        setPopulationSeries(
          validateMunicipalityPopulationSeries(
            populationData,
            validIndex.municipalities.map(
              ({ municipalityCode }) => municipalityCode,
            ),
          ),
        );
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setLoadError(true);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetchJson<MunicipalityInvestmentIndex>(
      "/data/municipality-investments/index.json",
      controller.signal,
    )
      .then((data) => setInvestmentMunicipalityCodes(
        new Set(data.municipalities.map(({ code }) => code)),
      ))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetchJson<MunicipalityProfileDataset>("/data/municipality-profiles.json", controller.signal)
      .then(setProfiles)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!selected || currentPolitics || !index) return;
    const controller = new AbortController();
    fetchJson<MunicipalityCurrentPoliticsDataset>("/data/municipality-politics-current-2026.json", controller.signal)
      .then((data) => setCurrentPolitics(validateMunicipalityCurrentPolitics(data, index.municipalities.map(({ municipalityCode }) => municipalityCode))))
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setPoliticsError(true); });
    return () => controller.abort();
  }, [currentPolitics, index, selected]);
  useEffect(() => {
    if ((metric !== "politics" && !politicsHistoryRequested) || electionHistory || politicsError || !index) return;
    const controller = new AbortController();
    fetchJson<MunicipalityElectionHistoryDataset>("/data/municipality-election-history-2000-2026.json", controller.signal)
      .then((data) => setElectionHistory(validateMunicipalityElectionHistory(data, index.municipalities.map(({ municipalityCode }) => municipalityCode))))
      .catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setPoliticsError(true); });
    return () => controller.abort();
  }, [electionHistory, index, metric, politicsError, politicsHistoryRequested]);
  useEffect(() => {
    if (
      !needsDemography ||
      demographySeries ||
      demographyError ||
      !index ||
      !populationSeries
    )
      return;
    const controller = new AbortController();
    fetchJson<MunicipalityDemographySeries>(
      "/data/municipality-demography-2002-2025.json",
      controller.signal,
    )
      .then((data) =>
        setDemographySeries(
          validateMunicipalityDemographySeries(
            data,
            populationSeries,
            index.municipalities.map(
              ({ municipalityCode }) => municipalityCode,
            ),
          ),
        ),
      )
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setDemographyError(true);
      });
    return () => controller.abort();
  }, [demographyError, demographySeries, index, needsDemography, populationSeries]);
  useEffect(() => {
    if (
      !needsMovement ||
      movementSeries ||
      movementError ||
      !index ||
      !populationSeries
    )
      return;
    const controller = new AbortController();
    fetchJson<MunicipalityMovementSeries>(
      "/data/municipality-movement-2002-2025.json",
      controller.signal,
    )
      .then((data) =>
        setMovementSeries(
          validateMunicipalityMovementSeries(
            data,
            populationSeries,
            index.municipalities.map(
              ({ municipalityCode }) => municipalityCode,
            ),
          ),
        ),
      )
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setMovementError(true);
      });
    return () => controller.abort();
  }, [index, movementError, movementSeries, needsMovement, populationSeries]);

  useEffect(() => {
    if (!needsStructure || structureSeries || structureError || !index || !populationSeries) return;
    const controller = new AbortController();
    fetchJson<MunicipalityStructureSeries>(
      "/data/municipality-structure-2022-2024.json",
      controller.signal,
    )
      .then((data) =>
        setStructureSeries(
          validateMunicipalityStructureSeries(
            data,
            populationSeries,
            index.municipalities.map(({ municipalityCode }) => municipalityCode),
          ),
        ),
      )
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setStructureError(true);
      });
    return () => controller.abort();
  }, [index, needsStructure, populationSeries, structureError, structureSeries]);

  useEffect(() => {
    if (!needsCosts || costSeries || costError || !index) return;
    const controller = new AbortController();
    fetchJson<MunicipalityCostSeries>(
      "/data/municipality-cost-shares-2010-2024.json",
      controller.signal,
    )
      .then((data) => setCostSeries(validateMunicipalityCostSeries(
        data,
        index.municipalities.map(({ municipalityCode }) => municipalityCode),
      )))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setCostError(true);
      });
    return () => controller.abort();
  }, [costError, costSeries, index, needsCosts]);

  useEffect(() => {
    if (!(metric === "digital" || (metric === "custom" && customMetric && kennzahlExpressionInputs(customMetric.expression).some(input => input.kind === "condition"))) || digitalPlatforms || digitalPlatformsError || !index) return;
    const controller = new AbortController();
    fetchJson<MunicipalityDigitalPlatformDataset>(
      "/data/municipality-digital-platforms.json",
      controller.signal,
    )
      .then((data) => setDigitalPlatforms(validateMunicipalityDigitalPlatformDataset(
        data,
        index.municipalities.map(({ municipalityCode }) => municipalityCode),
      )))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setDigitalPlatformsError(true);
      });
    return () => controller.abort();
  }, [customMetric, digitalPlatforms, digitalPlatformsError, index, metric]);

  return {
    index, populationSeries, demographySeries, movementSeries, structureSeries, costSeries,
    digitalPlatforms, investmentMunicipalityCodes, profiles, currentPolitics, electionHistory,
    politicsError, politicsHistoryRequested, setPoliticsHistoryRequested, loadError,
    demographyError, movementError, structureError, costError, digitalPlatformsError, selected,
  };
}
