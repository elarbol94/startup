"use client";

// Today's date in the calendar timezone. Starts from the server's value (so the first render
// already highlights today) and re-checks every minute so the page rolls over at midnight.
// Used by calendar-client.tsx.
import { useCallback, useSyncExternalStore } from "react";
import { localDateInZone } from "../../date-utils";

const subscribeToClock = (onStoreChange: () => void) => {
  const timer = window.setInterval(onStoreChange, 60_000);
  return () => window.clearInterval(timer);
};

export function useCalendarToday(serverToday: string, timezone: string) {
  const read = useCallback(() => {
    try {
      return localDateInZone(new Date(), timezone);
    } catch {
      return serverToday;
    }
  }, [serverToday, timezone]);
  return useSyncExternalStore(subscribeToClock, read, () => serverToday);
}
