"use client";

// Draws MapLine connections over the municipality fills, under the marker circles.
// Used by municipality-map-canvas.tsx.
import { useEffect, type RefObject } from "react";
import type * as maplibregl from "maplibre-gl";
import type { MapLine } from "./map-types";

const LINE_SOURCE_ID = "overlay-lines";
const LINE_LAYER_ID = "overlay-line-strokes";
/** The marker colour, so lines and circles read as one overlay; emphasised lines are darker. */
const LINE_COLOR = "#4f46e5";
const EMPHASIS_COLOR = "#be185d";

export function useMapLines(
  mapRef: RefObject<maplibregl.Map | null>,
  ready: boolean,
  lines: MapLine[] | null | undefined,
) {
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const data: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
      type: "FeatureCollection",
      features: (lines ?? []).map((line) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: [line.from, line.to] },
        properties: { emphasis: line.emphasis ?? false },
      })),
    };
    const source = map.getSource(LINE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      map.addSource(LINE_SOURCE_ID, { type: "geojson", data });
      map.addLayer({
        id: LINE_LAYER_ID,
        type: "line",
        source: LINE_SOURCE_ID,
        layout: { "line-cap": "round" },
        paint: {
          "line-color": ["case", ["get", "emphasis"], EMPHASIS_COLOR, LINE_COLOR],
          "line-width": 2,
          "line-opacity": 0.7,
          "line-dasharray": [2, 1.5],
        },
      });
    }
  }, [lines, mapRef, ready]);
}
