"use client";
// Which ribbon tab is showing, and whether the ribbon is collapsed to its tab names. Follows
// PowerPoint: the editor opens on Start; a contextual tab (Formformat) appears with a matching
// selection and is brought forward when a shape is drawn, and when its selection goes away the
// ribbon returns to the tab the author was on. Ctrl+F1 or a double-click on a tab collapses it;
// a collapsed ribbon shows a tab's commands over the canvas until one is used.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export type RibbonTab = "home" | "insert" | "design" | "slideShow" | "review" | "view" | "shapeFormat";
export const ribbonTabs: Exclude<RibbonTab, "shapeFormat">[] = ["home", "insert", "design", "slideShow", "review", "view"];

/** Whether this viewer keeps the ribbon collapsed -- a per-browser convenience only. */
const COLLAPSED_KEY = "presentation-ribbon-collapsed";
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const readCollapsed = () => { try { return window.localStorage.getItem(COLLAPSED_KEY) === "1"; } catch { return false; } };

export function useRibbonState({ contextual, onSearch }: { contextual: boolean; onSearch: () => void }) {
  const [chosen, setChosen] = useState<RibbonTab>("home");
  const [lastRegular, setLastRegular] = useState<RibbonTab>("home");
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  const [peek, setPeek] = useState(false);
  // A contextual tab cannot outlive its selection.
  const tab: RibbonTab = chosen === "shapeFormat" && !contextual ? lastRegular : chosen;

  const select = useCallback((next: RibbonTab) => {
    setChosen(next);
    if (next !== "shapeFormat") setLastRegular(next);
    setPeek(true);
  }, []);
  const setCollapsed = useCallback((next: boolean) => {
    try { window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0"); } catch { /* storage unavailable: lasts for this visit */ }
    listeners.forEach((listener) => listener());
    setPeek(false);
  }, []);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "F1" && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) { event.preventDefault(); setCollapsed(!readCollapsed()); }
      // Alt+Q jumps to "Suchen", PowerPoint's command search. Matched on the physical key: Option+Q types a character on a Mac.
      else if (event.code === "KeyQ" && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) { event.preventDefault(); onSearch(); }
      else if (event.key === "Escape" && peek) setPeek(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onSearch, peek, setCollapsed]);

  return {
    tab, select, collapsed, setCollapsed,
    /** A collapsed ribbon shows the chosen tab's commands while this is true. */
    open: !collapsed || peek, closePeek: useCallback(() => setPeek(false), []),
    /** Drawing a shape brings its Formformat tab forward, as in PowerPoint. */
    showContextual: useCallback(() => setChosen("shapeFormat"), []),
  };
}
