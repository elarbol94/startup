"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { compactStorageKey, storedCollapsed } from "@/lib/compact-layout";
import { useCompactLayout, useSidePanelsToggle } from "@/lib/use-compact-layout";
import { RAIL_ATTRIBUTE, RAIL_WIDTH, railStorageKey } from "./sidebar-model";

const RAIL_CHANGE_EVENT = "app-sidebar-rail-change";

function subscribe(onChange: () => void) {
  window.addEventListener(RAIL_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(RAIL_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readCollapsed(key: string, compact: boolean): boolean {
  try {
    return storedCollapsed(window.localStorage.getItem(key), compact);
  } catch {
    return compact;
  }
}

/** Whether the desktop sidebar is collapsed to its icon rail; remembered per user, browser and laptop/wide screen. */
export function useSidebarRail(userId: string) {
  const compact = useCompactLayout();
  const key = compactStorageKey(railStorageKey(userId), compact);
  const collapsed = useSyncExternalStore(subscribe, () => readCollapsed(key, compact), () => false);

  // After hydration the sidebar publishes its width inline; the page padding and the wiki rail follow it.
  useEffect(() => {
    const root = document.documentElement;
    if (collapsed) root.setAttribute(RAIL_ATTRIBUTE, "collapsed");
    else root.removeAttribute(RAIL_ATTRIBUTE);
    root.style.setProperty("--app-rail-width", collapsed ? RAIL_WIDTH.collapsed : RAIL_WIDTH.expanded);
    return () => {
      root.removeAttribute(RAIL_ATTRIBUTE);
      root.style.removeProperty("--app-rail-width");
    };
  }, [collapsed]);

  const setCollapsed = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(key, String(next));
    } catch {
      // Storage can be unavailable (private mode); the rail then resets on reload.
    }
    window.dispatchEvent(new Event(RAIL_CHANGE_EVENT));
  }, [key]);
  useSidePanelsToggle(setCollapsed);

  return { collapsed, setCollapsed };
}
