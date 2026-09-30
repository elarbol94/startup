"use client";
import { createContext, useCallback, useContext, useState, useSyncExternalStore } from "react";
export const OverviewEditingContext = createContext(false);
export const OverviewUserContext = createContext("");
const memory = new Map<string, string>();
const eventName = "overview-preferences-change";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(eventName, callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener(eventName, callback); };
}
const serverSnapshot = () => null;
const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;
export const useOverviewReady = () => useSyncExternalStore(subscribeReady, clientReady, serverReady);
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
