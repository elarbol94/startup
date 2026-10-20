"use client";
// Edits made with a shape's own handles and line settings: dropping a line end (glue to an
// object's connection site or free on the canvas), switching a line's route, and the
// adjustment handle. Used by presentation-editor.tsx.
import { useCallback } from "react";
import { isPresentationElementLocked, type PresentationCanvasAction } from "../../lib/presentation";
import { setLineEnd, setLineRoute, type ConnectorRoute } from "../../lib/presentation-connectors";
import type { LineEndDrop } from "./shape-handles";

export function usePresentationShapeEdits(dispatch: (action: PresentationCanvasAction) => void) {
  const onLineEndDrop = useCallback((id: string, end: 0 | 1, drop: LineEndDrop) => {
    dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => {
      const byId = new Map(current.map(e => [e.id, e]));
      const target = "elementId" in drop ? byId.get(drop.elementId) : undefined;
      if ("elementId" in drop && !target) return current;
      return current.map(e => e.id === id && e.type === "shape" && !isPresentationElementLocked(current, e.id)
        ? setLineEnd(e, end, target && "site" in drop ? { element: target, site: drop.site } : { point: (drop as { point: { x: number; y: number } }).point }, byId) : e);
    } });
  }, [dispatch]);
  const onRouteChange = useCallback((id: string, route: ConnectorRoute) => {
    dispatch({ type: "edit", at: Date.now(), separate: true, elements: current => {
      const byId = new Map(current.map(e => [e.id, e]));
      return current.map(e => e.id === id && e.type === "shape" && !isPresentationElementLocked(current, e.id) ? setLineRoute(e, route, byId) : e);
    } });
  }, [dispatch]);
  const onAdjust = useCallback((id: string, patch: { adjust?: number; cornerRadius?: number }) => {
    dispatch({ type: "edit", at: Date.now(), elements: current => current.map(e => e.id === id && e.type === "shape" && !isPresentationElementLocked(current, e.id) ? { ...e, content: { ...e.content, ...patch } } : e) });
  }, [dispatch]);
  return { onLineEndDrop, onRouteChange, onAdjust };
}
