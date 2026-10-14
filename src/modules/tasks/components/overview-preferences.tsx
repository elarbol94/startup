"use client";
import { createContext, useCallback, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
const OverviewUserContext = createContext("");
const OverviewEditingContext = createContext<{ editing: boolean; setEditing: (editing: boolean) => void }>({
  editing: false,
  setEditing: () => {},
});
/** Scopes the dashboard preferences (task view, table columns, layout) to the signed-in user. */
export function OverviewUserProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [editing, setEditing] = useState(false);
  return (
    <OverviewUserContext.Provider value={userId}>
      <OverviewEditingContext.Provider value={{ editing, setEditing }}>{children}</OverviewEditingContext.Provider>
    </OverviewUserContext.Provider>
  );
}
/** Whether the dashboard is in "Layout anpassen" mode; shared by the header button and the card grid. */
export const useOverviewEditing = () => useContext(OverviewEditingContext);
const memory = new Map<string, string>();
const eventName = "overview-preferences-change";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(eventName, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(eventName, callback); };
}
const serverSnapshot = () => null;
export function useOverviewPreference(name: string, legacyKey?: string) {
  const userId = useContext(OverviewUserContext);
  const key = `management:overview:${userId}:${name}`;
  const [failed, setFailed] = useState(false);
  const read = useCallback(() => {
    try { return memory.get(key) ?? window.localStorage.getItem(key) ?? (legacyKey ? window.localStorage.getItem(legacyKey) : null); }
    catch { return memory.get(key) ?? null; }
  }, [key, legacyKey]);
  const raw = useSyncExternalStore(subscribe, read, serverSnapshot);
  const save = (value: unknown) => {
    const json = JSON.stringify(value);
    try { window.localStorage.setItem(key, json); memory.delete(key); setFailed(false); }
    catch { memory.set(key, json); setFailed(true); }
    window.dispatchEvent(new Event(eventName));
  };
  return { raw, save, failed };
}
