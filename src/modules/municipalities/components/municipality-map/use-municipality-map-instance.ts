"use client";

// Owns the MapLibre instance behind every municipality map: creation, event wiring, feature state
// and paint updates. The caller decides the colours (`fillColor` over the `metric` feature state set
// from `values`) and the hover text. Used by municipality-map-canvas.tsx.
import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type {
  ExpressionSpecification,
  MapLayerMouseEvent,
  MapSourceDataEvent,
} from "maplibre-gl";
import type { MunicipalityBounds } from "../../data";
import {
  MAP_FILL_OPACITY,
  MAP_HOVER_FILL_OPACITY,
  MAP_NO_DATA_OPACITY,
} from "../../palette";
import { asMapBounds, BASE_STYLE, featureProperties, FILL_LAYER_ID, SOURCE_ID } from "./map-config";
import type { BaseMapLabels } from "./map-types";

export type MapInstanceOptions = {
  austriaBounds: MunicipalityBounds;
  selected: { municipalityCode: string } | null;
  onSelect: (code: string) => void;
  /** Value per municipality code; null (or a missing code) means "no data". */
  values: Record<string, number | null>;
  /** Fill colour over the `metric`/`hasMetric` feature state. Memoise it: a new one repaints. */
  fillColor: ExpressionSpecification;
  /** Lines under the municipality name in the hover popup. */
  tooltipLines: (code: string) => string[];
  /** Municipalities drawn with a strong outline next to the selection, such as peers. */
  highlightCodes: string[] | null;
  labels: BaseMapLabels;
};

export function useMunicipalityMapInstance({
  austriaBounds, selected, onSelect, values, fillColor, tooltipLines, highlightCodes, labels,
}: MapInstanceOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const hoveredIdRef = useRef<string | number | null>(null);
  const selectedIdRef = useRef<string | number | null>(null);
  const peerIdsRef = useRef<Set<string>>(new Set());
  const valueCodesRef = useRef<Set<string>>(new Set());
  const liveRef = useRef({ selected, onSelect, values, fillColor, tooltipLines, labels });
  useEffect(() => {
    liveRef.current = { selected, onSelect, values, fillColor, tooltipLines, labels };
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource(SOURCE_ID)) return;
    // Codes that dropped out of `values` go back to "no data" instead of keeping their old colour.
    for (const code of valueCodesRef.current)
      if (!(code in values)) map.setFeatureState({ source: SOURCE_ID, id: code }, { metric: 0, hasMetric: false });
    for (const [code, value] of Object.entries(values))
      map.setFeatureState(
        { source: SOURCE_ID, id: code },
        { metric: value ?? 0, hasMetric: value !== null },
      );
    valueCodesRef.current = new Set(Object.keys(values));
    if (map.getLayer(FILL_LAYER_ID)) map.setPaintProperty(FILL_LAYER_ID, "fill-color", fillColor);
  }, [fillColor, values, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource(SOURCE_ID)) return;
    const nextPeerIds = new Set(highlightCodes ?? []);
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
  }, [highlightCodes, ready]);

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
      for (const [code, value] of Object.entries(liveRef.current.values))
        map.setFeatureState(
          { source: SOURCE_ID, id: code },
          { metric: value ?? 0, hasMetric: value !== null },
        );
      valueCodesRef.current = new Set(Object.keys(liveRef.current.values));
      map.addLayer({
        id: FILL_LAYER_ID,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": liveRef.current.fillColor,
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
      const location = document.createElement("span");
      location.textContent = `${properties.state} · ${live.labels.municipalityCode} ${properties.municipalityCode}`;
      content.append(title);
      for (const line of live.tooltipLines(properties.municipalityCode)) {
        const span = document.createElement("span");
        span.textContent = line;
        content.append(span);
      }
      content.append(location);
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
  }, [austriaBounds]);

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
