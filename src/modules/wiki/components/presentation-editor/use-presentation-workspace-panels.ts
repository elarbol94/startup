"use client";
// Which panes flank the canvas: the frame rail (remembered per browser) and the side pane
// (Eigenschaften, Design, Assets, Kommentare). Below the docking width each is a drawer over
// the canvas, so only one shows at a time. Used by presentation-editor.tsx.
import { useCallback, useState, useSyncExternalStore } from "react";
import type { PropertiesRequest } from "./properties/properties-pane";
import type { RibbonPanel } from "./ribbon/ribbon-model";

/** Whether this viewer last left the frame rail open -- a per-browser convenience only. */
const RAIL_KEY = "presentation-frame-rail-open";
const subscribeRail = () => () => {};
// Only where the rail docks beside the canvas: on small screens it is a drawer over it.
const getRailOpen = () => { try { return window.localStorage.getItem(RAIL_KEY) === "1" && window.matchMedia("(min-width: 1280px)").matches; } catch { return false; } };

export function usePresentationWorkspacePanels() {
  const [activePanel, setActivePanel] = useState<RibbonPanel | null>(null);
  /** Which Eigenschaften tab to bring forward: a double-click asks for the object's own tab, a ribbon launcher for its group. */
  const [paneRequest, setPaneRequest] = useState<PropertiesRequest>({ tab: "primary", key: 0 });
  // The frame rail stays open for authors who keep it open, like PowerPoint's slide pane:
  // the last choice in this browser is the starting state.
  const railRemembered = useSyncExternalStore(subscribeRail, getRailOpen, () => false);
  const [pathChoice, setPathChoice] = useState<boolean | null>(null);
  const pathOpen = pathChoice ?? railRemembered;
  const setPathOpen = useCallback((next: boolean | ((open: boolean) => boolean)) => {
    const open = typeof next === "function" ? next(pathOpen) : next;
    setPathChoice(open);
    try { window.localStorage.setItem(RAIL_KEY, open ? "1" : "0"); } catch { /* storage unavailable: the choice lasts for this visit */ }
  }, [pathOpen]);

  // Below the docking width a side pane is a drawer over the canvas, so only one shows at a time.
  const narrow = () => !window.matchMedia("(min-width: 1280px)").matches;
  const togglePath = () => { setPathOpen(value => !value); if (narrow()) setActivePanel(null); };
  const openPanel = (panel: RibbonPanel) => { setActivePanel(panel); if (narrow()) setPathOpen(false); };
  const togglePanel = (panel: RibbonPanel) => { if (activePanel === panel) setActivePanel(null); else openPanel(panel); };
  const requestProperties = (tab: PropertiesRequest["tab"]) => { setPaneRequest((current) => ({ tab, key: current.key + 1 })); openPanel("properties"); };

  return { activePanel, setActivePanel, paneRequest, pathOpen, setPathOpen, togglePath, openPanel, togglePanel, requestProperties };
}
