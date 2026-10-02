"use client";

// Current time (epoch ms, rounded down to the minute) that re-renders once a minute.
// Returns null during server rendering so "past" styling never causes a hydration mismatch.
import { useSyncExternalStore } from "react";

const subscribe = (onStoreChange: () => void) => {
  const timer = window.setInterval(onStoreChange, 60_000);
  return () => window.clearInterval(timer);
};
const minuteSnapshot = () => Math.floor(Date.now() / 60_000) * 60_000;

export function useNowMinute(): number | null {
  return useSyncExternalStore(subscribe, minuteSnapshot, () => null);
}
