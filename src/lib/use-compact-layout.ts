"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { COMPACT_LAYOUT_QUERY, SIDE_PANELS_EVENT } from "./compact-layout";

function subscribeCompact(onChange: () => void) {
  const media = window.matchMedia(COMPACT_LAYOUT_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Whether the window is laptop-sized (see compact-layout.ts); follows resizes. Server render assumes a wide screen. */
export function useCompactLayout(): boolean {
  return useSyncExternalStore(subscribeCompact, () => window.matchMedia(COMPACT_LAYOUT_QUERY).matches, () => false);
}

/** Lets a side panel follow Mod+Shift+X. */
export function useSidePanelsToggle(setCollapsed: (collapsed: boolean) => void) {
  const setRef = useRef(setCollapsed);
  useEffect(() => {
    setRef.current = setCollapsed;
  });
  useEffect(() => {
    const onToggle = (event: Event) => setRef.current((event as CustomEvent<boolean>).detail);
    window.addEventListener(SIDE_PANELS_EVENT, onToggle);
    return () => window.removeEventListener(SIDE_PANELS_EVENT, onToggle);
  }, []);
}
