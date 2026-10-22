"use client";
// Whether the presenter has left the mouse alone for a while, so the player can hide its
// controls and the cursor from the audience. Used by presentation-player.tsx.
import { useEffect, useState } from "react";

/**
 * True once the pointer has not moved, pressed or scrolled for `ms`. Keys do not count: a
 * clicker presses one on every stop, and the controls should stay out of the talk then.
 */
export function useIdle(ms: number, enabled = true): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let timer = setTimeout(() => setIdle(true), ms);
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), ms);
    };
    const events = ["pointermove", "pointerdown", "wheel", "touchstart"] as const;
    for (const name of events) window.addEventListener(name, wake, { passive: true });
    return () => {
      clearTimeout(timer);
      for (const name of events) window.removeEventListener(name, wake);
    };
  }, [ms, enabled]);
  return enabled && idle;
}
