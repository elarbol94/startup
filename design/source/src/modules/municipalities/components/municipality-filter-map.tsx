"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import * as maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Match } from "../filters";
maplibre.setWorkerUrl("/vendor/maplibre-gl/maplibre-gl-worker.mjs");
export default function MunicipalityFilterMap({ results, colors, onSelect }: { results: Record<string, Match>; colors?: Record<string, string>; onSelect: (code: string) => void }) {
  const t = useTranslations("municipalityFilters");
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibre.Map | null>(null);
  const latest = useRef({ results, colors });
  const select = useRef(onSelect);
  const [failed, setFailed] = useState(false);
  useEffect(() => { select.current = onSelect; }, [onSelect]);
  useEffect(() => {
    latest.current = { results, colors };
    const map = mapRef.current;
    if (map?.getSource("municipalities")) for (const [id, value] of Object.entries(results)) map.setFeatureState({ source: "municipalities", id }, { color: colors?.[id] ?? (value === null ? "#f59e0b" : value ? "#0d9488" : "#cbd5e1") });
  }, [results, colors]);
  useEffect(() => {
    if (!container.current) return;
    let map: maplibre.Map;
    let observer: ResizeObserver | undefined;
    let cancelled = false;
    let hoveredId: string | number | null = null;
    const popup = new maplibre.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    // Initialize after layout; WebGL errors are reported from the browser callback.
    const frame = requestAnimationFrame(() => {
    if (cancelled || !container.current) return;
    try { map = new maplibre.Map({ container: container.current, style: { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#f1f5f9" } }] }, bounds: [[9.45, 46.3], [17.2, 49.08]], fitBoundsOptions: { padding: 20 }, attributionControl: { compact: true } }); } catch { setFailed(true); return; }
    mapRef.current = map;
    map.addControl(new maplibre.NavigationControl({ showCompass: false }));
    map.on("error", () => setFailed(true));
    map.on("load", () => {
      map.addSource("municipalities", { type: "geojson", data: "/data/municipalities-at-2026.geojson", promoteId: "municipalityCode", attribution: "© Statistik Austria, CC BY 4.0" });
      for (const [id, value] of Object.entries(latest.current.results)) map.setFeatureState({ source: "municipalities", id }, { color: latest.current.colors?.[id] ?? (value === null ? "#f59e0b" : value ? "#0d9488" : "#cbd5e1") });
      map.addLayer({ id: "fill", type: "fill", source: "municipalities", paint: { "fill-color": ["coalesce", ["feature-state", "color"], "#cbd5e1"], "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 1, 0.85] } });
      map.addLayer({ id: "borders", type: "line", source: "municipalities", paint: { "line-color": "#ffffff", "line-width": 0.5 } });
      map.addLayer({ id: "hover-outline", type: "line", source: "municipalities", paint: { "line-color": "#0f766e", "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2.5, 0] } });
      map.on("mousemove", "fill", e => {
        const feature = e.features?.[0];
        if (feature?.id === undefined) return;
        if (hoveredId !== null && hoveredId !== feature.id) map.setFeatureState({ source: "municipalities", id: hoveredId }, { hover: false });
        hoveredId = feature.id;
        map.setFeatureState({ source: "municipalities", id: hoveredId }, { hover: true });
        popup.setLngLat(e.lngLat).setText(String(feature.properties.name)).addTo(map);
      });
      map.on("click", "fill", e => { const code = e.features?.[0]?.properties?.municipalityCode; if (code) select.current(String(code)); });
      map.on("mouseenter", "fill", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "fill", () => { map.getCanvas().style.cursor = ""; popup.remove(); if (hoveredId !== null) map.setFeatureState({ source: "municipalities", id: hoveredId }, { hover: false }); hoveredId = null; });
    });
    observer = new ResizeObserver(() => map.resize()); observer.observe(container.current);
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); observer?.disconnect(); popup.remove(); map?.remove(); mapRef.current = null; };
  }, []);
  return <div className="space-y-2"><div ref={container} className="h-[28rem] overflow-hidden rounded-xl border" role="region" aria-label={t("map")} />{failed && <p role="alert" className="text-sm text-destructive">{t("mapError")}</p>}{!colors && <div className="flex flex-wrap gap-4 text-xs">{([["matches", "bg-teal-600"], ["unknown", "bg-amber-500"], ["excluded", "bg-slate-300"]] as const).map(([key, color]) => <span className="flex items-center gap-2" key={key}><span className={`size-3 rounded-sm ${color}`} />{t(key)}</span>)}</div>}</div>;
}
