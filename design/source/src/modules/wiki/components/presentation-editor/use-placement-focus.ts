"use client";
// Where focus goes when a menu or dialog that started placing an element closes: to the
// canvas, so Enter places the element in the middle and Escape cancels. Used by
// presentation-editor.tsx as the `finalFocus` of the insert menu and picker.
import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

export function usePlacementFocus(canvasRef: RefObject<HTMLElement | null>, placing: boolean) {
  // Read when the popup closes, after the render that started placing -- a prop computed in
  // the render that opened the menu would still say "not placing".
  const current = useRef(placing);
  useLayoutEffect(() => { current.current = placing; }, [placing]);
  return useCallback(() => current.current ? canvasRef.current : true, [canvasRef]);
}
