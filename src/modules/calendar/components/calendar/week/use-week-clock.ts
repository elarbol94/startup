"use client";

// Minute clock and hydration flag for the week timeline. Both report the server
// value during hydration, so nothing time-dependent mismatches the SSR markup.
import { useSyncExternalStore } from "react";

let minuteListeners = new Set<() => void>();
let minuteTimer: number | null = null;
let currentMinute = 0;

function subscribeMinute(listener: () => void) {
  minuteListeners.add(listener);
  if (minuteTimer === null) {
    const tick = () => {
      currentMinute = Math.floor(Date.now() / 60_000);
      minuteListeners.forEach((notify) => notify());
    };
    // Align ticks to the start of each minute.
    const align = window.setTimeout(() => {
      tick();
      minuteTimer = window.setInterval(tick, 60_000);
    }, 60_000 - (Date.now() % 60_000));
    minuteTimer = align;
  }
  return () => {
    minuteListeners.delete(listener);
    if (minuteListeners.size === 0 && minuteTimer !== null) {
      window.clearTimeout(minuteTimer);
      window.clearInterval(minuteTimer);
      minuteTimer = null;
      minuteListeners = new Set();
    }
  };
}

function minuteSnapshot() {
  const minute = Math.floor(Date.now() / 60_000);
  if (minute !== currentMinute) currentMinute = minute;
  return currentMinute;
}

/** Current time in ms, rounded down to the minute; null on the server and during hydration. */
export function useNowMinute(): number | null {
  const minute = useSyncExternalStore<number | null>(subscribeMinute, minuteSnapshot, () => null);
  return minute === null ? null : minute * 60_000;
}

const noopSubscribe = () => () => {};

/** False on the server and during hydration, true afterwards (and on client-only mounts). */
export function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
