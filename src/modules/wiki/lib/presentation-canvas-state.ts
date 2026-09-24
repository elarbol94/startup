// Editor canvas state: undo/redo history, autosave dirty tracking and the canvas reducer.
// Re-exported by presentation.ts; used by the presentation editor and collaboration bridge.
import { z } from "zod";
import { maintainPresentationLayout } from "./presentation-layout";
import { retainObservedPresentationSections } from "./presentation-source";
import { mergePresentation, presentationValuesEqual } from "./presentation-merge";
import { defaultPresentationSettings, presentationElementsSchema, presentationSettingsSchema, presentationStepsSchema, type PresentationElement, type PresentationSettings, type PresentationStep } from "./presentation-model";
import { applyGeometryChanges, type PresentationGeometryChange, type SnapGuide } from "./presentation-transform";

/**
 * Undo/redo for one editing session. Pointer gestures have explicit boundaries and
 * form one undo step even when paused; other rapid edits use a coalescing window.
 * The stack is capped because a canvas snapshot is the whole element array.
 */
export const PRESENTATION_HISTORY_COALESCE_MS = 350;
export const PRESENTATION_HISTORY_LIMIT = 50;

export type PresentationSnapshot = {
  elements: PresentationElement[];
  steps: PresentationStep[];
  background: string;
  settings: PresentationSettings;
  title: string;
};

export const presentationSnapshotSchema = z.object({ elements: presentationElementsSchema, steps: presentationStepsSchema,
  background: z.string().max(32), settings: presentationSettingsSchema, title: z.string().trim().min(1).max(200) });

export type PresentationCanvasState = PresentationSnapshot & {
  /** Alignment lines to draw for the gesture in progress. */
  guides: SnapGuide[];
  past: PresentationSnapshot[];
  future: PresentationSnapshot[];
  /** Set by every edit, cleared once that exact canvas has been written to the server. */
  dirty: boolean;
  /** The last write failed and nothing has been edited since: the autosave stays parked
   * here instead of retrying the same doomed save every debounce. */
  failed: boolean;
  editedAt: number;
  gestureActive: boolean;
};

export type PresentationCanvasAction =
  | {
    type: "edit";
    at: number;
    separate?: boolean;
    elements?: (current: PresentationElement[]) => PresentationElement[];
    steps?: (current: PresentationStep[]) => PresentationStep[];
  }
  | { type: "geometry"; at: number; changes: PresentationGeometryChange[]; tolerance: number; gesture: boolean }
  | { type: "gesture-start" }
  | { type: "gesture-end" }
  | { type: "source-headings"; elements: (current: PresentationElement[]) => PresentationElement[] }
  | { type: "undo" }
  | { type: "redo" }
  /** Marks the canvas clean, but only if it is still the one that was saved. */
  | {
    type: "saved";
    elements: PresentationElement[];
    steps: PresentationStep[];
    background: string;
    settings: PresentationSettings;
    title?: string;
  }
  | { type: "touch"; background?: string; settings?: Partial<PresentationSettings>; title?: string }
  | { type: "reset"; snapshot: PresentationSnapshot }
  | { type: "shared"; snapshot: PresentationSnapshot; guides?: SnapGuide[] }
  | { type: "remote"; base: PresentationSnapshot; snapshot: PresentationSnapshot }
  | { type: "failed" }
  /** The lock that refused the last write has lifted: the parked edit may go out again. */
  | { type: "recovered" };

export function initialPresentationCanvasState(
  elements: PresentationElement[],
  steps: PresentationStep[],
  background = "",
  settings: PresentationSettings = defaultPresentationSettings,
  title = "",
): PresentationCanvasState {
  return { elements, steps, background, settings, title, guides: [], past: [], future: [], dirty: false, failed: false, editedAt: 0, gestureActive: false };
}

function commitCanvas(
  state: PresentationCanvasState,
  elements: PresentationElement[],
  steps: PresentationStep[],
  at: number,
  separate = false,
): PresentationCanvasState {
  if (elements === state.elements && steps === state.steps) return state;
  elements = maintainPresentationLayout(elements);
  const coalesce = !separate && state.past.length > 0 && state.editedAt > 0
    && (state.gestureActive || at - state.editedAt <= PRESENTATION_HISTORY_COALESCE_MS);
  return {
    ...state,
    elements,
    steps,
    dirty: true,
    failed: false,
    editedAt: separate ? 0 : at,
    past: coalesce ? state.past : [...state.past, canvasSnapshot(state)].slice(-PRESENTATION_HISTORY_LIMIT),
    future: [],
  };
}

function canvasSnapshot(state: PresentationCanvasState): PresentationSnapshot {
  const { elements, steps, background, settings, title } = state;
  return { elements, steps, background, settings, title };
}

function travelCanvas(state: PresentationCanvasState, direction: "undo" | "redo"): PresentationCanvasState {
  const source = direction === "undo" ? state.past : state.future;
  if (!source.length) return state;
  const snapshot = source[source.length - 1];
  const current = canvasSnapshot(state);
  return {
    ...state,
    ...snapshot,
    elements: retainObservedPresentationSections(snapshot.elements, state.elements),
    guides: [],
    gestureActive: false,
    past: direction === "undo" ? source.slice(0, -1) : [...state.past, current],
    future: direction === "undo" ? [...state.future, current] : source.slice(0, -1),
    dirty: true,
    failed: false,
    // The next edit opens its own undo step rather than coalescing into the one just undone.
    editedAt: 0,
  };
}

export function presentationCanvasReducer(
  state: PresentationCanvasState,
  action: PresentationCanvasAction,
): PresentationCanvasState {
  switch (action.type) {
    case "gesture-start":
      return state.gestureActive ? state : { ...state, gestureActive: true, editedAt: 0, guides: [] };
    case "gesture-end":
      return !state.gestureActive && !state.guides.length ? state : { ...state, gestureActive: false, editedAt: 0, guides: [] };
    case "shared": return { ...state, ...action.snapshot, guides: action.guides ?? state.guides, dirty: false, failed: false };
    case "remote": {
      const merged = mergePresentation(action.base, state, action.snapshot);
      if (merged.conflicts.length) return { ...state, failed: true };
      return { ...state, ...merged.snapshot, past: [], future: [], guides: [], editedAt: 0, gestureActive: false,
        dirty: !presentationValuesEqual(merged.snapshot, { elements: action.snapshot.elements, steps: action.snapshot.steps, title: action.snapshot.title, background: action.snapshot.background, settings: action.snapshot.settings }), failed: false };
    }
    case "reset":
      return initialPresentationCanvasState(action.snapshot.elements, action.snapshot.steps, action.snapshot.background, action.snapshot.settings, action.snapshot.title);
    case "edit":
      return commitCanvas(
        state,
        action.elements ? action.elements(state.elements) : state.elements,
        action.steps ? action.steps(state.steps) : state.steps,
        action.at,
        action.separate,
      );
    case "source-headings": {
      const elements = action.elements(state.elements);
      if (elements === state.elements) return state;
      // Linked headings follow their document, including when undoing a canvas
      // edit. Keep custom-title overrides intact and do not add an undo step.
      const update = (snapshot: PresentationSnapshot) => ({ ...snapshot, elements: action.elements(snapshot.elements) });
      return { ...state, elements, past: state.past.map(update), future: state.future.map(update), dirty: true };
    }
    case "geometry": {
      const result = applyGeometryChanges(state.elements, action.changes, action.tolerance, state.guides);
      const next = commitCanvas(state, result.elements, state.steps, action.at);
      // The canvas library can deliver late drag updates after cancellation.
      const guides = action.gesture && state.gestureActive ? result.guides : [];
      if (next === state && !guides.length && !state.guides.length) return state;
      return { ...next, guides };
    }
    case "undo":
    case "redo":
      return travelCanvas(state, action.type);
    case "saved": {
      // Anything the author changed while the write was in flight keeps the canvas dirty,
      // so the follow-up autosave carries it to the server.
      const current = state.elements === action.elements
        && state.steps === action.steps
        && state.background === action.background
        && state.settings === action.settings
        && (action.title === undefined || state.title === action.title);
      return current ? { ...state, dirty: false, failed: false } : state;
    }
    case "touch": {
      const background = action.background ?? state.background;
      const settings = action.settings ? { ...state.settings, ...action.settings } : state.settings;
      const title = action.title ?? state.title;
      if (background === state.background && title === state.title
        && Object.keys(settings).every((key) => settings[key as keyof PresentationSettings] === state.settings[key as keyof PresentationSettings])) return state;
      return {
        ...state, background, settings, title, dirty: true, failed: false, editedAt: 0,
        past: [...state.past, canvasSnapshot(state)].slice(-PRESENTATION_HISTORY_LIMIT), future: [],
      };
    }
    case "failed":
      return state.failed ? state : { ...state, failed: true };
    case "recovered":
      return state.failed ? { ...state, failed: false } : state;
  }
}
