"use client";

// Draws MapMarker circles over the municipality fills and removes them when the overlay
// is switched off. Used by municipality-map-canvas.tsx.
import { useEffect, useRef, type RefObject } from "react";
import type * as maplibregl from "maplibre-gl";
import type { MapLayerMouseEvent } from "maplibre-gl";
import type { MapMarker } from "./map-types";

const MARKER_SOURCE_ID = "overlay-markers";
const MARKER_LAYER_ID = "overlay-marker-circles";
/** Distinct from every fill palette so the circles read as a separate layer. */
const MARKER_COLOR = "#4f46e5";

export function useMapMarkers(
  mapRef: RefObject<maplibregl.Map | null>,
  ready: boolean,
  markers: MapMarker[] | null | undefined,
  onSelect: (code: string) => void,
) {
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const data: GeoJSON.FeatureCollection<GeoJSON.Point> = {
      type: "FeatureCollection",
      features: (markers ?? []).map((marker) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [marker.lng, marker.lat] },
        properties: { code: marker.code, count: marker.count, hollow: marker.hollow ?? false },
      })),
    };
    const source = map.getSource(MARKER_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      map.addSource(MARKER_SOURCE_ID, { type: "geojson", data });
      map.addLayer({
        id: MARKER_LAYER_ID,
        type: "circle",
        source: MARKER_SOURCE_ID,
        paint: {
          // Area grows with the count: radius follows its square root.
          "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "count"]], 1, 6, 5, 18],
          "circle-color": ["case", ["get", "hollow"], "#ffffff", MARKER_COLOR],
          "circle-opacity": 0.85,
          "circle-stroke-color": ["case", ["get", "hollow"], MARKER_COLOR, "#ffffff"],
          "circle-stroke-width": ["case", ["get", "hollow"], 2.5, 1.5],
        },
      });
      const click = (event: MapLayerMouseEvent) => {
        const code = event.features?.[0]?.properties?.code;
        if (typeof code === "string") onSelectRef.current(code);
      };
      map.on("click", MARKER_LAYER_ID, click);
    }
    map.setLayoutProperty(MARKER_LAYER_ID, "visibility", markers ? "visible" : "none");
  }, [mapRef, markers, ready]);
}
