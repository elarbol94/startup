"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { restorePresentationLocation } from "../../lib/presentation-location";
import { sceneOfStop, type PresentationPosition, type PresentationStop } from "../../lib/presentation-details";
import type { PresentationElement } from "../../lib/presentation-model";

/** Keep local playback reloadable without broadcasting the author's camera or starting
 * server navigation on every click. Live followers still belong entirely to their host. */
export function usePlayerLocation(elements: PresentationElement[], stops: PresentationStop[], startStepId?: string, follow?: { stepIndex?: number }, startMode: "path" | "free" = "path") {
  const query = useSearchParams();
  const mode = query.get("mode");
  const freeMode = !follow && (mode === "free" || (mode !== "path" && startMode === "free"));
  const [canvasView, setCanvasView] = useState(() => !follow && (query.get("view") === "canvas"
    || (query.get("view") !== "stop" && freeMode && !query.get("at") && !startStepId)));
  const canvasViewRef = useRef(canvasView);
  const showCanvas = useCallback(() => { canvasViewRef.current = true; setCanvasView(true); }, []);
  const showStop = useCallback(() => { canvasViewRef.current = false; setCanvasView(false); }, []);
  const [position, setPosition] = useState<PresentationPosition>(() => follow
    ? { index: Math.min(Math.max(follow.stepIndex ?? 0, 0), Math.max(stops.length - 1, 0)), returns: [] }
    : restorePresentationLocation(elements, stops, { sceneId: query.get("scene"), stepId: query.get("at") }, startStepId));

  useEffect(() => {
    if (follow) return;
    const url = new URL(window.location.href);
    const scene = sceneOfStop(stops, position.index);
    const stop = stops[position.index];
    if (scene) url.searchParams.set("scene", scene); else url.searchParams.delete("scene");
    if (stop) url.searchParams.set("at", stop.step.id); else url.searchParams.delete("at");
    url.searchParams.delete("from");
    url.searchParams.set("mode", freeMode ? "free" : "path");
    url.searchParams.set("view", canvasView ? "canvas" : "stop");
    const next = url.pathname + url.search + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(null, "", next);
    }
  }, [follow, position, stops, freeMode, canvasView]);

  return { position, setPosition, freeMode, canvasView, canvasViewRef, showCanvas, showStop };
}
