// MapLibre source/layer ids, the basemap style and small feature helpers for the municipality map.
// Used by municipality-map.tsx and use-municipality-map-instance.ts.
import type { MapLayerMouseEvent, StyleSpecification } from "maplibre-gl";
import type { MunicipalityBounds, MunicipalityProperties } from "../../data";

export const SOURCE_ID = "austrian-municipalities";
export const FILL_LAYER_ID = "municipality-fills";

export const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "basemap-at": {
      type: "raster",
      tiles: [
        "https://mapsneu.wien.gv.at/basemap/bmapgrau/normal/google3857/{z}/{y}/{x}.png",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© basemap.at",
    },
  },
  layers: [
    {
      id: "map-background",
      type: "background",
      paint: { "background-color": "#e8ece9" },
    },
    {
      id: "basemap-at",
      type: "raster",
      source: "basemap-at",
      paint: { "raster-opacity": 0.72, "raster-saturation": -0.7 },
    },
  ],
};

export function asMapBounds(
  bounds: MunicipalityBounds,
): [[number, number], [number, number]] {
  return [
    [bounds[0], bounds[1]],
    [bounds[2], bounds[3]],
  ];
}
export function featureProperties(
  event: MapLayerMouseEvent,
): MunicipalityProperties | null {
  const properties = event.features?.[0]?.properties;
  return properties &&
    typeof properties.municipalityCode === "string" &&
    typeof properties.name === "string" &&
    typeof properties.state === "string"
    ? (properties as MunicipalityProperties)
    : null;
}
