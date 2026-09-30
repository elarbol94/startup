// Tells drags from clicks on timeline bars and deadlines: once a gesture travels past the
// threshold, the click that follows pointerup is ignored. Used by portfolio-client.tsx and the drag hooks.
"use client";

import { useRef } from "react";
import { DRAG_CLICK_THRESHOLD } from "./portfolio-constants";

export function useDragClickGuard() {
  // A bar is both draggable and clickable, and the browser fires click after
  // pointerup either way. Once the pointer has travelled past the threshold the
  // gesture was a drag, so the click that follows must not open the inspector.
  const draggedRef = useRef(false);

  /** Marks the gesture a drag once the pointer travels far enough to count. */
  function trackDragMovement(clientX: number, startX: number) {
    if (Math.abs(clientX - startX) > DRAG_CLICK_THRESHOLD) draggedRef.current = true;
  }

  /**
   * Releases the drag flag once the click that follows pointerup has been
   * dispatched. A macrotask is late enough for that click and early enough that
   * a cancelled gesture cannot leave the flag stuck.
   */
  function releaseDragFlag() {
    setTimeout(() => {
      draggedRef.current = false;
    }, 0);
  }

  return { draggedRef, trackDragMovement, releaseDragFlag };
}
