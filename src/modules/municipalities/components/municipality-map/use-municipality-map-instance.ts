"use client";

// Owns the MapLibre instance behind MunicipalityMap: creation, event wiring, feature state and paint
// updates (effects kept in their original order). Used by municipality-map.tsx.
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type {
  ExpressionSpecification,
  MapLayerMouseEvent,
  MapSourceDataEvent,
} from "maplibre-gl";
import {
  MAP_FILL_OPACITY,
  MAP_HOVER_FILL_OPACITY,
  MAP_NO_DATA_OPACITY,
} from "../../palette";
import { metricColorExpression, type ColorInputs } from "./map-color-expressions";
import { asMapBounds, BASE_STYLE, featureProperties, FILL_LAYER_ID, SOURCE_ID } from "./map-config";
import type { MunicipalityMapProps } from "./map-types";

export function useMunicipalityMapInstance({
  austriaBounds, selected, onSelect, metric, metricValues, tooltipValues, labels,
  usePopulationClasses, scaleDomain, movementPalette, costMeasure, politicsView, digitalView,
  peerMunicipalityCodes, personsFormatter,
}: Pick<
  MunicipalityMapProps,
  | "austriaBounds"
  | "selected"
  | "onSelect"
  | "metric"
  | "metricValues"
  | "tooltipValues"
  | "labels"
  | "usePopulationClasses"
  | "scaleDomain"
  | "movementPalette"
  | "costMeasure"
  | "politicsView"
  | "digitalView"
  | "peerMunicipalityCodes"
> & { personsFormatter: Intl.NumberFormat }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const hoveredIdRef = useRef<string | number | null>(null);
  const selectedIdRef = useRef<string | number | null>(null);
  const peerIdsRef = useRef<Set<string>>(new Set());
  const colorInputs: ColorInputs = {
    usePopulationClasses, scaleDomain, metric, movementPalette, costMeasure, politicsView, digitalView,
  };
  const liveRef = useRef({
    selected,
    onSelect,
    metric,
    metricValues,
    tooltipValues,
    labels,
    colorInputs,
  });
  useEffect(() => {
    liveRef.current = {
      selected,
      onSelect,
      metric,
      metricValues,
      tooltipValues,
      labels,
      colorInputs,
    };
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource(SOURCE_ID)) return;
    for (const [code, value] of Object.entries(metricValues))
      map.setFeatureState(
        { source: SOURCE_ID, id: code },
        { metric: value ?? 0, hasMetric: value !== null },
      );
    if (map.getLayer(FILL_LAYER_ID)) {
      map.setPaintProperty(FILL_LAYER_ID, "fill-color", metricColorExpression({
        usePopulationClasses, scaleDomain, metric, movementPalette, costMeasure, politicsView, digitalView,
      }));
    }
  }, [costMeasure, digitalView, metric, metricValues, movementPalette, politicsView, ready, scaleDomain, usePopulationClasses]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource(SOURCE_ID)) return;
    const nextPeerIds = new Set(peerMunicipalityCodes ?? []);
    for (const code of peerIdsRef.current) {
      if (!nextPeerIds.has(code)) map.setFeatureState({ source: SOURCE_ID, id: code }, { peer: false });
    }
    for (const code of nextPeerIds) map.setFeatureState({ source: SOURCE_ID, id: code }, { peer: true });
    peerIdsRef.current = nextPeerIds;
    const highlightPeers = nextPeerIds.size > 0;
    // Municipalities without a value drop to MAP_NO_DATA_OPACITY so the basemap shows
    // through: no neutral grey separates from the pale end of a ramp by colour alone.
    const noData: ExpressionSpecification = ["!", ["boolean", ["feature-state", "hasMetric"], false]];
    map.setPaintProperty(FILL_LAYER_ID, "fill-opacity", highlightPeers
      ? ["case", noData, MAP_NO_DATA_OPACITY, ["boolean", ["feature-state", "selected"], false], 0.9, ["boolean", ["feature-state", "peer"], false], 0.82, ["boolean", ["feature-state", "hover"], false], 0.56, 0.24]
      : ["case", noData, MAP_NO_DATA_OPACITY, ["boolean", ["feature-state", "hover"], false], MAP_HOVER_FILL_OPACITY, MAP_FILL_OPACITY]);
    map.setPaintProperty("municipality-lines", "line-color", highlightPeers
      ? ["case", ["boolean", ["feature-state", "selected"], false], "#000000", ["boolean", ["feature-state", "peer"], false], "#0f766e", ["boolean", ["feature-state", "hover"], false], "#0f766e", "#ffffff"]
      : ["case", ["boolean", ["feature-state", "selected"], false], "#000000", ["boolean", ["feature-state", "hover"], false], "#0f766e", "#ffffff"]);
    map.setPaintProperty("municipality-lines", "line-width", highlightPeers
      ? ["case", ["boolean", ["feature-state", "selected"], false], 3.5, ["boolean", ["feature-state", "peer"], false], 2.2, ["boolean", ["feature-state", "hover"], false], 1.4, 0.45]
      : ["case", ["boolean", ["feature-state", "selected"], false], 3.5, ["boolean", ["feature-state", "hover"], false], 1.4, 0.65]);
  }, [peerMunicipalityCodes, ready]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASE_STYLE,
      bounds: asMapBounds(austriaBounds),
      fitBoundsOptions: { padding: 38 },
      maxBounds: [
        [8.2, 45.4],
        [18.4, 50.1],
      ],
      minZoom: 5,
      maxZoom: 14,
      attributionControl: { compact: true },
      cooperativeGestures: true,
      locale: {
        "CooperativeGesturesHandler.WindowsHelpText": liveRef.current.labels.zoomHintWindows,
        "CooperativeGesturesHandler.MacHelpText": liveRef.current.labels.zoomHintMac,
        "CooperativeGesturesHandler.MobileHelpText": liveRef.current.labels.zoomHintMobile,
      },
    });
    mapRef.current = map;
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: "municipality-hover-popup",
    });
    map.on("load", () => {
      const markReady = (event: MapSourceDataEvent) => {
        if (event.sourceId === SOURCE_ID)
          map.once("render", () => {
            if (map.querySourceFeatures(SOURCE_ID).length > 0) {
              setReady(true);
              map.off("sourcedata", markReady);
            }
          });
      };
      map.on("sourcedata", markReady);
      map.addSource(SOURCE_ID, {
        type: "geojson",
        data: "/data/municipalities-at-2026.geojson",
        promoteId: "municipalityCode",
        attribution: "© Statistik Austria, CC BY 4.0",
      });
      for (const [code, value] of Object.entries(liveRef.current.metricValues))
        map.setFeatureState(
          { source: SOURCE_ID, id: code },
          { metric: value ?? 0, hasMetric: value !== null },
        );
      map.addLayer({
        id: FILL_LAYER_ID,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": metricColorExpression(liveRef.current.colorInputs),
          "fill-opacity": [
            "case",
            ["!", ["boolean", ["feature-state", "hasMetric"], false]],
            MAP_NO_DATA_OPACITY,
            ["boolean", ["feature-state", "hover"], false],
            MAP_HOVER_FILL_OPACITY,
            MAP_FILL_OPACITY,
          ],
          "fill-outline-color": "#f8faf9",
        },
      });
      map.addLayer({
        id: "municipality-lines",
        type: "line",
        source: SOURCE_ID,
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#000000",
            ["boolean", ["feature-state", "hover"], false],
            "#0f766e",
            "#ffffff",
          ],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3.5,
            ["boolean", ["feature-state", "hover"], false],
            1.4,
            0.65,
          ],
          "line-opacity": 0.95,
        },
      });
      if (liveRef.current.selected) {
        selectedIdRef.current = liveRef.current.selected.municipalityCode;
        map.setFeatureState(
          { source: SOURCE_ID, id: selectedIdRef.current },
          { selected: true },
        );
      }
    });
    map.on("mousemove", FILL_LAYER_ID, (event: MapLayerMouseEvent) => {
      const properties = featureProperties(event);
      const featureId = event.features?.[0]?.id;
      if (!properties || featureId === undefined) return;
      if (hoveredIdRef.current !== null && hoveredIdRef.current !== featureId)
        map.setFeatureState(
          { source: SOURCE_ID, id: hoveredIdRef.current },
          { hover: false },
        );
      hoveredIdRef.current = featureId;
      map.setFeatureState(
        { source: SOURCE_ID, id: featureId },
        { hover: true },
      );
      map.getCanvas().style.cursor = "pointer";
      const live = liveRef.current;
      const content = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = properties.name;
      const value = document.createElement("span");
      value.textContent =
        live.tooltipValues
          ? (live.tooltipValues[properties.municipalityCode] ?? "—")
          : `${live.labels.population}: ${personsFormatter.format(live.metricValues[properties.municipalityCode] ?? 0)}`;
      const location = document.createElement("span");
      location.textContent = `${properties.state} · ${live.labels.municipalityCode} ${properties.municipalityCode}`;
      content.append(title, value, location);
      popup.setLngLat(event.lngLat).setDOMContent(content).addTo(map);
    });
    map.on("mouseleave", FILL_LAYER_ID, () => {
      if (hoveredIdRef.current !== null)
        map.setFeatureState(
          { source: SOURCE_ID, id: hoveredIdRef.current },
          { hover: false },
        );
      hoveredIdRef.current = null;
      map.getCanvas().style.cursor = "";
      popup.remove();
    });
    map.on("click", FILL_LAYER_ID, (event: MapLayerMouseEvent) => {
      const properties = featureProperties(event);
      if (properties) liveRef.current.onSelect(properties.municipalityCode);
    });
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [austriaBounds, personsFormatter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource(SOURCE_ID)) return;
    if (selectedIdRef.current !== null)
      map.setFeatureState(
        { source: SOURCE_ID, id: selectedIdRef.current },
        { selected: false },
      );
    if (selected) {
      selectedIdRef.current = selected.municipalityCode;
      map.setFeatureState(
        { source: SOURCE_ID, id: selected.municipalityCode },
        { selected: true },
      );
    } else selectedIdRef.current = null;
  }, [selected]);

  return { containerRef, mapRef, ready };
}
