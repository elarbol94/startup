"use client";

// Collapsed state of the calendar sidebar, persisted in localStorage (SSR renders expanded).
// Used by calendar-sidebar.tsx.
import { useCallback, useSyncExternalStore } from "react";
import { SIDEBAR_COLLAPSED_STORAGE_KEY } from "./sidebar-types";

const CHANGE_EVENT = "calendar-sidebar-collapsed-change";
// Fallback when localStorage is unavailable, so collapsing still works for this page load.
let memoryValue = false;

function read() {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return memoryValue;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);
  const setCollapsed = useCallback((next: boolean) => {
    memoryValue = next;
    try {
      if (next) window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, "1");
      else window.localStorage.removeItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
    } catch {
      // Storage unavailable (private mode); memoryValue keeps the change for this page load.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [collapsed, setCollapsed] as const;
}
