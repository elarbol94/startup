// Save-state type and the duration/number input helpers shared by the presentation editor's
// panels. Used by presentation-editor.tsx and the pieces in this folder.

/** Well inside the server's lease timeout, so a live editor never looks abandoned. */
export type SaveState = "idle" | "unsaved" | "saving" | "saved" | "error";

/** The schema's own bounds, so a duration field clamps to what the server will accept. */
export const STEP_DURATION_RANGE = { min: 500, max: 120_000 };
export const CAMERA_TRANSITION_RANGE = { min: 100, max: 5_000 };
/** Durations are seconds on screen and milliseconds in the document. */
export const secondsText = (ms: number) => String(ms / 1000);
export const msFromSecondsText = (seconds: string) => Math.round(Number(seconds) * 1000);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** The plain number fields read like the duration ones: the entry clamped into range, or
 * null when nothing usable was typed and the stored value should simply stay. */
export const parseNumberInput = (raw: string, min: number, max: number): number | null => {
  const value = Number(raw.trim());
  return raw.trim() && Number.isFinite(value) ? clamp(value, min, max) : null;
};
