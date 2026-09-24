"use client";
// Draft state for a panel field that commits on blur/Enter. Used by draft-fields.tsx.
import { useState } from "react";

/**
 * Every panel field holds a draft. It shows exactly what the author typed until the field
 * is left -- or Enter is pressed on a single-line one -- and resyncs whenever the value on
 * the canvas changes underneath it, which is what makes undo and redo visible in the panel.
 * `normalise` turns a finished draft into the value that is actually stored, so a number
 * field is clamped once instead of on every keystroke ("0.4" stays "0.4" while it is being
 * typed), and returning the current value from it is how an unusable entry reverts. Only a
 * value that really differs is committed: tabbing through the panel must not fill the undo
 * stack or mark the canvas unsaved.
 */
export function useDraft(value: string, onCommit: (next: string) => void, normalise: (raw: string) => string = (raw) => raw) {
  const [draft, setDraft] = useState(value);
  // Adjusting the draft while rendering rather than in an effect: React re-runs this
  // component before touching the DOM, so an undo never flashes the stale text.
  const [synced, setSynced] = useState(value);
  if (synced !== value) {
    setSynced(value);
    setDraft(value);
  }
  return {
    draft,
    setDraft,
    commit: () => {
      const next = normalise(draft);
      setDraft(next);
      if (next !== value) onCommit(next);
    },
  };
}
