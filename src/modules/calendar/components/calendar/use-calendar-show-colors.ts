"use client";

// "Colours by calendar" toggle: on by default, remembered per device in localStorage. Read
// through useSyncExternalStore so the server render (default on) never mismatches hydration.
// Used by calendar-client.tsx.
import { useCallback, useSyncExternalStore } from "react";
import { SHOW_COLORS_STORAGE_KEY } from "./calendar-types";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SHOW_COLORS_STORAGE_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function readStored() {
  try {
    return window.localStorage.getItem(SHOW_COLORS_STORAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function useCalendarShowColors() {
  const showCalendarColors = useSyncExternalStore(subscribe, readStored, () => true);
  const setShowCalendarColors = useCallback((value: boolean) => {
    try {
      window.localStorage.setItem(SHOW_COLORS_STORAGE_KEY, String(value));
    } catch {}
    listeners.forEach((listener) => listener());
  }, []);
  return [showCalendarColors, setShowCalendarColors] as const;
}
