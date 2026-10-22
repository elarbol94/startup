"use client";

import { useCallback, useReducer, useState } from "react";
import { PresentationFocusHistory } from "../../lib/presentation-focus";
import type { PresentationPosition, PresentationSceneId } from "../../lib/presentation-details";

export function usePlayerFocus(scene: PresentationSceneId) {
  const [history] = useState(() => new PresentationFocusHistory());
  const [, refresh] = useReducer(value => value + 1, 0);
  const getFocused = useCallback((target: PresentationSceneId) => history.current(target), [history]);
  const push = useCallback((target: PresentationSceneId, id: string, position: PresentationPosition, ancestors: string[]) => {
    const changed = history.push(target, id, position, ancestors);
    if (changed) refresh();
    return changed;
  }, [history]);
  const pop = useCallback((target: PresentationSceneId) => {
    const previous = history.pop(target);
    if (previous) refresh();
    return previous;
  }, [history]);
  const clear = useCallback((target: PresentationSceneId) => {
    if (history.current(target)) { history.clear(target); refresh(); }
  }, [history]);
  return { elementId: history.current(scene), getFocused, push, pop, clear };
}
