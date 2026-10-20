"use client";
// View → Grid and Guides state of the presentation editor: the toggles, PowerPoint's
// Shift+F9 / Alt+F9 shortcuts, and the snap options passed with every canvas drag.
// Used by presentation-editor.tsx.
import { useCallback, useEffect, useRef } from "react";
import { defaultGuides, guideLines, rulerOrigin, type PresentationSnapOptions } from "../../lib/presentation-grid";
import type { PresentationElement, PresentationSettings } from "../../lib/presentation";

type ViewSettings = Pick<PresentationSettings, "grid" | "guides" | "ruler">;
type PresentationGuide = ViewSettings["guides"]["list"][number];

export function usePresentationViewSettings({ settings, update, elements, viewportCenter, createId }: {
  settings: ViewSettings;
  /** Shallow-merged into the settings: always pass a complete `grid` / `guides` object. */
  update: (partial: Partial<ViewSettings>) => void;
  elements: PresentationElement[];
  /** The canvas point at the centre of the visible canvas. */
  viewportCenter: () => { x: number; y: number };
  createId: () => string;
}) {
  const { grid, guides, ruler } = settings;

  // React Flow reports drags without their pointer event, so Alt (PowerPoint's "don't snap
  // while dragging") is tracked here and read when the geometry is dispatched.
  const altHeld = useRef(false);
  useEffect(() => {
    const track = (event: KeyboardEvent | PointerEvent) => { altHeld.current = event.altKey; };
    const release = () => { altHeld.current = false; };
    window.addEventListener("keydown", track, true);
    window.addEventListener("keyup", track, true);
    window.addEventListener("pointermove", track, true);
    window.addEventListener("pointerdown", track, true);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("keydown", track, true);
      window.removeEventListener("keyup", track, true);
      window.removeEventListener("pointermove", track, true);
      window.removeEventListener("pointerdown", track, true);
      window.removeEventListener("blur", release);
    };
  }, []);

  const toggleGrid = useCallback(() => update({ grid: { ...grid, show: !grid.show } }), [grid, update]);
  const toggleSnap = useCallback(() => update({ grid: { ...grid, snap: !grid.snap } }), [grid, update]);
  const setSpacing = useCallback((spacing: number) => {
    if (Number.isFinite(spacing)) update({ grid: { ...grid, spacing: Math.min(Math.max(spacing, 1), 1000) } });
  }, [grid, update]);
  const toggleRuler = useCallback(() => update({ ruler: !ruler }), [ruler, update]);
  const toggleSmart = useCallback(() => update({ guides: { ...guides, smart: !guides.smart } }), [guides, update]);
  // PowerPoint's first "Display drawing guides" puts a pair through the slide's centre.
  const toggleGuides = useCallback(() => update({
    guides: { ...guides, show: !guides.show, list: !guides.show && !guides.list.length ? defaultGuides(rulerOrigin(elements, viewportCenter()), createId) : guides.list },
  }), [guides, update, elements, viewportCenter, createId]);
  const setGuides = useCallback((list: PresentationGuide[]) => update({ guides: { ...guides, list } }), [guides, update]);
  const addGuide = useCallback((axis: "x" | "y", position: number) =>
    update({ guides: { ...guides, show: true, list: [...guides.list, { id: createId(), axis, position }] } }), [guides, update, createId]);

  /** Options for a `geometry` dispatch. Alt (held now, or `altKey`) turns every kind of snapping off;
   * hidden guides do not snap, the grid snaps whether or not it is shown. */
  const snapOptions = useCallback((altKey = altHeld.current): PresentationSnapOptions => {
    if (altKey) return { smart: false };
    return {
      grid: grid.snap ? grid.spacing : undefined,
      guides: guides.show && guides.list.length ? guideLines(guides.list) : undefined,
      smart: guides.smart,
    };
  }, [grid, guides]);

  /** Shift+F9 toggles the grid, Alt+F9 the guides. Returns whether the key was handled. */
  const onKeyDown = useCallback((event: Pick<KeyboardEvent, "key" | "shiftKey" | "altKey" | "ctrlKey" | "metaKey" | "preventDefault">) => {
    if (event.key !== "F9" || event.ctrlKey || event.metaKey || event.shiftKey === event.altKey) return false;
    event.preventDefault();
    if (event.shiftKey) toggleGrid(); else toggleGuides();
    return true;
  }, [toggleGrid, toggleGuides]);

  return { toggleGrid, toggleGuides, toggleRuler, toggleSnap, toggleSmart, setSpacing, setGuides, addGuide, snapOptions, onKeyDown };
}
