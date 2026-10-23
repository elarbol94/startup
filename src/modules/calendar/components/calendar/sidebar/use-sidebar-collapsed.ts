"use client";

// Collapsed state of the calendar sidebar, persisted in localStorage per laptop/wide screen
// (SSR renders expanded; laptops start collapsed). Used by calendar-sidebar.tsx.
import { useCallback, useSyncExternalStore } from "react";
import { compactStorageKey, storedCollapsed } from "@/lib/compact-layout";
import { useCompactLayout, useSidePanelsToggle } from "@/lib/use-compact-layout";
import { SIDEBAR_COLLAPSED_STORAGE_KEY } from "./sidebar-types";

const CHANGE_EVENT = "calendar-sidebar-collapsed-change";
// Fallback when localStorage is unavailable, so collapsing still works for this page load.
let memoryValue: boolean | null = null;

function read(key: string, compact: boolean) {
  try {
    return storedCollapsed(window.localStorage.getItem(key), compact);
  } catch {
    return memoryValue ?? compact;
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
  const compact = useCompactLayout();
  const key = compactStorageKey(SIDEBAR_COLLAPSED_STORAGE_KEY, compact);
  const collapsed = useSyncExternalStore(subscribe, () => read(key, compact), () => false);
  const setCollapsed = useCallback((next: boolean) => {
    memoryValue = next;
    try {
      window.localStorage.setItem(key, next ? "1" : "0");
    } catch {
      // Storage unavailable (private mode); memoryValue keeps the change for this page load.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [key]);
  useSidePanelsToggle(setCollapsed);
  return [collapsed, setCollapsed] as const;
}
