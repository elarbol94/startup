"use client";

// Remembers whether the week's compact tasks row is expanded (per browser).
import { useCallback, useSyncExternalStore } from "react";
import { TASKS_EXPANDED_STORAGE_KEY } from "./week-utils";

const CHANGE_EVENT = "calendar:week-tasks-expanded-change";

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

// In-memory fallback when storage is unavailable (private mode, blocked site data).
let memoryValue = false;

function read() {
  try {
    const stored = window.localStorage.getItem(TASKS_EXPANDED_STORAGE_KEY);
    return stored === null ? memoryValue : stored === "1";
  } catch {
    return memoryValue;
  }
}

export function useTasksExpanded() {
  const expanded = useSyncExternalStore(subscribe, read, () => false);
  const setExpanded = useCallback((next: boolean) => {
    memoryValue = next;
    try {
      window.localStorage.setItem(TASKS_EXPANDED_STORAGE_KEY, next ? "1" : "0");
    } catch {}
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return [expanded, setExpanded] as const;
}
