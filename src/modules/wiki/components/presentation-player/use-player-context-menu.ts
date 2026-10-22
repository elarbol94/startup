"use client";

import { useEffect, useRef, type MouseEvent } from "react";

// Leave enough time for ordinary mouse double-clicks (including the common
// 500ms desktop setting); otherwise the first click navigates before the second.
const DOUBLE_RIGHT_CLICK_MS = 600;

/** Defer one right-click briefly so its first half cannot leave a detail canvas before
 * a double-right-click asks to see that same canvas in full. */
export function usePlayerContextMenu(actions: {
  disabled: boolean;
  isFlipping: () => boolean;
  prepare: () => void;
  back: () => void;
  overview: () => void;
}) {
  const latest = useRef(actions);
  useEffect(() => { latest.current = actions; });
  const pending = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current.timer); }, []);

  return (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("a,video,audio,input,textarea,select,button,summary,details")) return;
    event.preventDefault();
    event.stopPropagation();
    const act = latest.current;
    if (act.disabled || act.isFlipping()) return;
    act.prepare();
    const previous = pending.current;
    if (previous) {
      clearTimeout(previous.timer);
      pending.current = null;
      if (Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 12) {
        act.overview();
        return;
      }
      act.back();
    }
    pending.current = {
      x: event.clientX, y: event.clientY,
      timer: setTimeout(() => {
        pending.current = null;
        if (!latest.current.disabled && !latest.current.isFlipping()) latest.current.back();
      }, DOUBLE_RIGHT_CLICK_MS),
    };
  };
}
