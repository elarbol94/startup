// Restores the portfolio view when the user returns to /projects with browser Back/Forward
// (for example after opening a project from the Gantt). The history entry is tagged with an
// id; the view is saved under it while scrolling and when leaving. Used by portfolio-client.tsx.
"use client";

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import {
  historyViewId,
  readHistoryView,
  withHistoryViewId,
  writeHistoryView,
  type HistoryPortfolioView,
} from "./history-view-state";
import type { SetState, Zoom } from "./portfolio-types";
import { zoomModeForDayWidth } from "./portfolio-utils";

type Snapshot = Omit<HistoryPortfolioView, "dayWidth" | "scrollLeft" | "scrollTop" | "expandedProjects" | "expandedTasks"> & {
  expandedProjects: Set<string>;
  expandedTasks: Set<string>;
};

export function useHistoryView({
  enabled,
  snapshot,
  scrollRef,
  dayWidthRef,
  setView,
  setQuery,
  setOwner,
  setHealth,
  setCriticalVisible,
  setLinesVisible,
  setDayWidth,
  setZoom,
  setTreeWidth,
  setExpandedProjects,
  setExpandedTasks,
}: {
  enabled: boolean;
  snapshot: Snapshot;
  scrollRef: RefObject<HTMLDivElement | null>;
  dayWidthRef: RefObject<number>;
  setView: SetState<"timeline" | "projects">;
  setQuery: SetState<string>;
  setOwner: SetState<string>;
  setHealth: SetState<"all" | "risk" | "track">;
  setCriticalVisible: SetState<boolean>;
  setLinesVisible: SetState<boolean>;
  setDayWidth: SetState<number>;
  setZoom: SetState<Zoom>;
  setTreeWidth: SetState<number>;
  setExpandedProjects: SetState<Set<string>>;
  setExpandedTasks: SetState<Set<string>>;
}) {
  const idRef = useRef<string | null>(null);
  /** True when a saved view was restored, so the initial fit-to-today must be skipped. */
  const restoredRef = useRef(false);
  const snapshotRef = useRef(snapshot);
  // Refs are detached before unmount cleanup runs, so track the scroll position as it changes.
  const lastScrollRef = useRef({ left: 0, top: 0 });
  useEffect(() => {
    snapshotRef.current = snapshot;
  });

  useLayoutEffect(() => {
    if (!enabled) return;
    let id = historyViewId(window.history.state);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.history.replaceState(withHistoryViewId(window.history.state, id), "");
    }
    idRef.current = id;
    let saved: HistoryPortfolioView | null = null;
    try {
      saved = readHistoryView(window.sessionStorage, id);
    } catch {
      saved = null;
    }
    if (!saved) return;
    const view = saved;
    restoredRef.current = true;
    setView(view.view);
    setQuery(view.query);
    setOwner(view.owner);
    setHealth(view.health);
    setCriticalVisible(view.criticalVisible);
    setLinesVisible(view.linesVisible);
    dayWidthRef.current = view.dayWidth;
    setDayWidth(view.dayWidth);
    setZoom(zoomModeForDayWidth(view.dayWidth));
    if (view.treeWidth > 0) setTreeWidth(view.treeWidth);
    setExpandedProjects(new Set(view.expandedProjects));
    setExpandedTasks(new Set(view.expandedTasks));
    lastScrollRef.current = { left: view.scrollLeft, top: view.scrollTop };
    // Wait for the restored widths and rows to lay out before scrolling.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ left: view.scrollLeft, top: view.scrollTop, behavior: "auto" });
      });
    });
    return () => cancelAnimationFrame(frame);
    // Restore once per mount; setters and refs are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const save = () => {
      const id = idRef.current;
      if (!id) return;
      // Next.js router.refresh()/replace may drop custom history state; re-tag the entry.
      if (historyViewId(window.history.state) !== id && window.location.pathname === "/projects" && !window.location.search) {
        window.history.replaceState(withHistoryViewId(window.history.state, id), "");
      }
      const current = snapshotRef.current;
      try {
        writeHistoryView(window.sessionStorage, id, {
          ...current,
          expandedProjects: [...current.expandedProjects],
          expandedTasks: [...current.expandedTasks],
          dayWidth: dayWidthRef.current,
          scrollLeft: lastScrollRef.current.left,
          scrollTop: lastScrollRef.current.top,
        });
      } catch {
        // The view simply is not restored when browser storage is unavailable.
      }
    };
    const container = scrollRef.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      if (container) lastScrollRef.current = { left: container.scrollLeft, top: container.scrollTop };
      clearTimeout(timer);
      timer = setTimeout(save, 150);
    };
    container?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      clearTimeout(timer);
      container?.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", save);
      // Leaving the page (e.g. opening a project) unmounts the portfolio: save the final view.
      save();
    };
  }, [enabled, scrollRef, dayWidthRef]);

  return { restoredRef };
}
