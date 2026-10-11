"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
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

function readCollapsed(userId: string): boolean {
  try {
    return window.localStorage.getItem(railStorageKey(userId)) === "true";
  } catch {
    return false;
  }
}

/** Whether the desktop sidebar is collapsed to its icon rail; remembered per user in this browser. */
export function useSidebarRail(userId: string) {
  const collapsed = useSyncExternalStore(subscribe, () => readCollapsed(userId), () => false);

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
      window.localStorage.setItem(railStorageKey(userId), String(next));
    } catch {
      // Storage can be unavailable (private mode); the rail then resets on reload.
    }
    window.dispatchEvent(new Event(RAIL_CHANGE_EVENT));
  }, [userId]);

  return { collapsed, setCollapsed };
}
