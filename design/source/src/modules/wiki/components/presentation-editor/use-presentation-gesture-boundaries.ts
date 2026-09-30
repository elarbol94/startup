"use client";
// Opens and closes a canvas gesture (one undo step), ending it after the canvas library's
// final pointer update, on blur or when the tab is hidden. Used by presentation-editor.tsx.
import { useCallback, useEffect } from "react";
import type { PresentationCanvasAction } from "../../lib/presentation";

export function usePresentationGestureBoundaries(dispatch: (action: PresentationCanvasAction) => void) {
  const startGesture = useCallback(() => dispatch({ type: "gesture-start" }), [dispatch]);
  const endGesture = useCallback(() => dispatch({ type: "gesture-end" }), [dispatch]);
  useEffect(() => {
    // A release/cancellation need not include geometry. Run after the canvas
    // library's final pointer/mouse update, including releases outside the canvas.
    let frame = 0;
    const finish = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(endGesture);
    };
    const hide = () => { if (document.hidden) endGesture(); };
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("mouseup", finish, true);
    window.addEventListener("pointercancel", finish, true);
    window.addEventListener("blur", endGesture);
    document.addEventListener("visibilitychange", hide);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("mouseup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
      window.removeEventListener("blur", endGesture);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [endGesture]);
  return { startGesture, endGesture };
}
