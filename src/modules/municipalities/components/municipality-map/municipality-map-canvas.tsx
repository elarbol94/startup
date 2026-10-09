"use client";

// The bare municipality map: polygons coloured by the caller, hover popup, selection, zoom and
// reset controls, optional marker circles and connection lines. Gemeinde-specific controls live in
// municipality-map.tsx; the network map (network/components/network-map/) builds on this too.
// Load it with next/dynamic and `ssr: false`: MapLibre needs the browser.
import { useEffect, type ReactNode } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MunicipalityBounds } from "../../data";
import { asMapBounds } from "./map-config";
import type { MapLine, MapMarker } from "./map-types";
import { useMapLines } from "./use-map-lines";
import { useMapMarkers } from "./use-map-markers";
import { useMunicipalityMapInstance, type MapInstanceOptions } from "./use-municipality-map-instance";

maplibregl.setWorkerUrl("/vendor/maplibre-gl/maplibre-gl-worker.mjs");

export type MunicipalityMapCanvasProps = MapInstanceOptions & {
  onReset: () => void;
  /** Circles drawn over the fills; null hides them. */
  markers?: MapMarker[] | null;
  /** Connection lines drawn under the circles. */
  lines?: MapLine[] | null;
  /** The map flies here when it is ready and whenever a new array is passed. */
  focusBounds?: MunicipalityBounds | null;
  /** Extra buttons at the bottom of the zoom/reset stack. */
  controls?: ReactNode;
  /** Overlays positioned inside the map, such as a legend. */
  children?: ReactNode;
  testId?: string;
};

export function MunicipalityMapCanvas({
  onReset, markers, lines, focusBounds, controls, children, testId = "municipality-map", ...instance
}: MunicipalityMapCanvasProps) {
  const { austriaBounds, labels, onSelect } = instance;
  const { containerRef, mapRef, ready } = useMunicipalityMapInstance(instance);
  useMapLines(mapRef, ready, lines);
  useMapMarkers(mapRef, ready, markers, onSelect);

  useEffect(() => {
    if (ready && focusBounds)
      mapRef.current?.fitBounds(asMapBounds(focusBounds), { padding: 48, maxZoom: 10, duration: 500 });
  }, [focusBounds, mapRef, ready]);

  return (
    <div
      className="relative h-full min-h-0 overflow-hidden rounded-2xl bg-[#e8ece9]"
      data-testid={testId}
      data-map-ready={ready}
      data-overlay-markers={markers ? markers.length : undefined}
    >
      <div
        ref={containerRef}
        className="h-full w-full"
        aria-label={labels.map}
      />
      <div className="absolute top-16 right-3 z-10 flex flex-col overflow-hidden rounded-lg border bg-background/95 shadow-sm backdrop-blur lg:top-3">
        <button
          type="button"
          className="grid size-11 place-items-center text-lg hover:bg-accent lg:size-9"
          aria-label={labels.zoomIn}
          onClick={() => mapRef.current?.zoomIn()}
        >
          +
        </button>
        <button
          type="button"
          className="grid size-11 place-items-center border-t text-lg hover:bg-accent lg:size-9"
          aria-label={labels.zoomOut}
          onClick={() => mapRef.current?.zoomOut()}
        >
          −
        </button>
        <button
          type="button"
          className="min-h-11 border-t px-2 py-2 text-[10px] font-semibold whitespace-nowrap hover:bg-accent lg:min-h-0"
          aria-label={labels.reset}
          onClick={() => {
            mapRef.current?.fitBounds(asMapBounds(austriaBounds), {
              padding: 38,
              duration: 500,
            });
            onReset();
          }}
        >
          {labels.reset}
        </button>
        {controls}
      </div>
      {children}
    </div>
  );
}
