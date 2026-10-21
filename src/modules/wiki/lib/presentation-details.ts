// Detail pages: any element on the canvas can open a frame of its own ("Detailseite"), which
// the player turns over to like the back of a card. The frame lives on the same canvas, far
// below the deck, so editing, undo, collaboration and export treat it like every other frame;
// only what is shown at a time is scoped to one "scene". Re-exported by presentation.ts.
import { presentationAncestors, presentationDescendants } from "./presentation-hierarchy";
import { PRESENTATION_FRAME_SIZE } from "./presentation-frames";
import { presentationCameraBounds, unionBounds } from "./presentation-geometry";
import type { PresentationBounds, PresentationElement, PresentationStep } from "./presentation-model";

/** Where detail pages are laid out: far enough below any real deck that nothing drifts into them. */
export const PRESENTATION_DETAIL_ORIGIN = { x: 0, y: 100_000 };
export const PRESENTATION_DETAIL_GAP = 400;

/** The scene an element belongs to: null for the overview, otherwise its detail frame's id. */
export type PresentationSceneId = string | null;

export type PresentationDetails = {
  /** Detail frame id → the element that opens it. */
  boxByFrame: Map<string, string>;
  /** Opening element id → its detail frame id. */
  frameByBox: Map<string, string>;
  sceneOf: (id: string) => PresentationSceneId;
};

const cache = new WeakMap<PresentationElement[], PresentationDetails>();

/**
 * Resolves the detail links of a canvas. A link only counts when its frame is a section frame,
 * is not one the opening element sits inside (that page could never be left) and can be
 * reached from the overview, so a broken or circular link never hides content: the frame just
 * shows up as an ordinary frame again.
 */
export function presentationDetails(elements: PresentationElement[]): PresentationDetails {
  const cached = cache.get(elements);
  if (cached) return cached;
  const byId = new Map(elements.map((element) => [element.id, element]));
  const candidates = elements.filter((element) => {
    const target = element.detailId ? byId.get(element.detailId) : undefined;
    return target?.type === "frame" && !target.content.isGroup && target.id !== element.id
      && !presentationAncestors(elements, element.id).some((ancestor) => ancestor.id === target.id);
  });
  let frames = new Set(candidates.map((element) => element.detailId!));
  const sceneIn = (set: Set<string>, id: string): PresentationSceneId => {
    if (set.has(id)) return id;
    return presentationAncestors(elements, id).find((ancestor) => set.has(ancestor.id))?.id ?? null;
  };
  // Keep only frames reachable from the overview; dropping one can strand others, so repeat.
  for (;;) {
    const reached = new Set<string>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const box of candidates) {
        const frame = box.detailId!;
        if (!frames.has(frame) || reached.has(frame)) continue;
        const scene = sceneIn(frames, box.id);
        if (scene === null || reached.has(scene)) { reached.add(frame); grew = true; }
      }
    }
    if (reached.size === frames.size) break;
    frames = reached;
  }
  const boxByFrame = new Map<string, string>(), frameByBox = new Map<string, string>();
  for (const box of candidates) {
    const frame = box.detailId!;
    if (!frames.has(frame)) continue;
    frameByBox.set(box.id, frame);
    if (!boxByFrame.has(frame)) boxByFrame.set(frame, box.id);
  }
  const scenes = new Map<string, PresentationSceneId>();
  const details: PresentationDetails = {
    boxByFrame, frameByBox,
    sceneOf: (id) => {
      if (!scenes.has(id)) scenes.set(id, sceneIn(frames, id));
      return scenes.get(id)!;
    },
  };
  cache.set(elements, details);
  return details;
}

/** What is drawn while one scene is open: the overview without any detail page, or one page. */
export function presentationSceneElements(elements: PresentationElement[], sceneId: PresentationSceneId): PresentationElement[] {
  const { sceneOf } = presentationDetails(elements);
  return elements.filter((element) => sceneOf(element.id) === sceneId);
}

/** The way down to a scene, outermost first: each detail page with the element that opens it. */
export function presentationSceneTrail(elements: PresentationElement[], sceneId: PresentationSceneId): { frame: PresentationElement; box: PresentationElement }[] {
  const { boxByFrame, sceneOf } = presentationDetails(elements);
  const byId = new Map(elements.map((element) => [element.id, element]));
  const trail: { frame: PresentationElement; box: PresentationElement }[] = [];
  const seen = new Set<string>();
  let scene = sceneId;
  while (scene && !seen.has(scene)) {
    seen.add(scene);
    const frame = byId.get(scene), box = byId.get(boxByFrame.get(scene) ?? "");
    if (!frame || !box) break;
    trail.unshift({ frame, box });
    scene = sceneOf(box.id);
  }
  return trail;
}

/** A free slot for a new detail page: in a row right of the existing ones. */
export function nextDetailFrameBounds(elements: PresentationElement[]): PresentationBounds {
  const { boxByFrame } = presentationDetails(elements);
  const right = elements.filter((element) => boxByFrame.has(element.id))
    .reduce((max, frame) => Math.max(max, frame.x + frame.width + PRESENTATION_DETAIL_GAP), PRESENTATION_DETAIL_ORIGIN.x);
  return { x: right, y: PRESENTATION_DETAIL_ORIGIN.y, ...PRESENTATION_FRAME_SIZE };
}

/** The visible words of an element, used to name the detail page it opens. */
export function presentationElementCaption(element: PresentationElement): string {
  const raw = element.type === "frame" ? element.content.label
    : element.type === "text" ? element.content.text
      : element.type === "shape" ? element.content.text ?? ""
        : element.type === "icon" ? element.content.label ?? ""
          : element.type === "chart" ? element.content.title : "";
  // "Gegenstands-\nverleih" written across lines reads as one word again.
  return raw.replace(/-\s*\n\s*/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
}

/** Creates the detail page of `boxId` and links it; the new frame is the last element. */
export function createPresentationDetail(elements: PresentationElement[], boxId: string, frameId: string): PresentationElement[] {
  const box = elements.find((element) => element.id === boxId);
  if (!box || presentationDetails(elements).frameByBox.has(boxId)) return elements;
  const frame: PresentationElement = { id: frameId, type: "frame", ...nextDetailFrameBounds(elements), rotation: 0,
    content: { label: presentationElementCaption(box), shape: "rect", color: "" } };
  return [...elements.map((element) => element.id === boxId ? { ...element, detailId: frameId } : element), frame];
}

/** Unlinks a detail page and deletes it with everything on it, nested detail pages included. */
export function removePresentationDetail(elements: PresentationElement[], boxId: string): PresentationElement[] {
  const frameId = presentationDetails(elements).frameByBox.get(boxId);
  if (!frameId) return elements;
  const doomed = new Set<string>();
  const collect = (sceneId: string) => {
    for (const element of presentationSceneElements(elements, sceneId)) {
      doomed.add(element.id);
      const nested = presentationDetails(elements).frameByBox.get(element.id);
      if (nested && !doomed.has(nested)) collect(nested);
    }
  };
  collect(frameId);
  return elements.filter((element) => !doomed.has(element.id))
    .map((element) => element.id === boxId ? { ...element, detailId: undefined } : element);
}

/**
 * One stop of the presented path. Steps keep their single list: a step simply belongs to the
 * scene of the element it targets. A detail page without steps of its own still gets one
 * stop, on the page itself, appended after the real steps (`stepIndex` null).
 */
export type PresentationStop = { step: PresentationStep; stepIndex: number | null; sceneId: PresentationSceneId };

export function presentationStops(elements: PresentationElement[], steps: PresentationStep[]): PresentationStop[] {
  const { boxByFrame, sceneOf } = presentationDetails(elements);
  const known = new Set(elements.map((element) => element.id));
  const stops: PresentationStop[] = [];
  steps.forEach((step, stepIndex) => { if (known.has(step.elementId)) stops.push({ step, stepIndex, sceneId: sceneOf(step.elementId) }); });
  for (const frameId of boxByFrame.keys()) {
    if (!stops.some((stop) => stop.sceneId === frameId)) stops.push({ step: { id: `detail:${frameId}`, elementId: frameId }, stepIndex: null, sceneId: frameId });
  }
  return stops;
}

/** Steps whose target is in the given scene, in path order: what the editor's rail lists. */
export function presentationSceneSteps(elements: PresentationElement[], steps: PresentationStep[], sceneId: PresentationSceneId): PresentationStep[] {
  const { sceneOf } = presentationDetails(elements);
  return steps.filter((step) => sceneOf(step.elementId) === sceneId);
}

/**
 * Where the player stands: a stop index (-1 is the overview of a deck without stops) and the
 * stops to return to when the open detail pages are left, innermost last.
 */
export type PresentationPosition = { index: number; returns: number[] };

export function sceneOfStop(stops: PresentationStop[], index: number): PresentationSceneId {
  return stops[index]?.sceneId ?? null;
}

/** Opening a detail page lands on its first stop and remembers where to come back to. */
export function enterPresentationDetail(stops: PresentationStop[], position: PresentationPosition, frameId: string): PresentationPosition | null {
  const first = stops.findIndex((stop) => stop.sceneId === frameId);
  return first < 0 ? null : { index: first, returns: [...position.returns, position.index] };
}

/**
 * Leaving a detail page goes back where it was opened from. A position that arrived without
 * that history (a follower, a jump from the presenter view) returns to the stop of the
 * element that opens the page, or else the first stop of the scene around it.
 */
export function exitPresentationDetail(elements: PresentationElement[], stops: PresentationStop[], position: PresentationPosition): PresentationPosition | null {
  const scene = sceneOfStop(stops, position.index);
  if (scene === null) return null;
  if (position.returns.length) return { index: position.returns.at(-1)!, returns: position.returns.slice(0, -1) };
  const { boxByFrame, sceneOf } = presentationDetails(elements);
  const box = boxByFrame.get(scene);
  const parent = box ? sceneOf(box) : null;
  const ownStop = stops.findIndex((stop) => stop.sceneId === parent && stop.step.elementId === box);
  return { index: ownStop >= 0 ? ownStop : stops.findIndex((stop) => stop.sceneId === parent), returns: [] };
}

/**
 * The arrow keys walk the open scene only. Past its last stop (or before its first) a detail
 * page closes again; the overview simply stops at its ends. Moving forward onto a stop on an
 * element with a detail page opens that page, so a clicker with only "next" and "back" can
 * take every detour the author put on the path; coming back to it leaves the page closed.
 */
export function stepPresentationPosition(elements: PresentationElement[], stops: PresentationStop[], position: PresentationPosition, delta: 1 | -1): PresentationPosition {
  const scene = sceneOfStop(stops, position.index);
  for (let index = position.index + delta; index >= 0 && index < stops.length; index += delta) {
    if (stops[index].sceneId !== scene) continue;
    const arrived = { ...position, index };
    const { step } = stops[index];
    const frameId = delta === 1 && (!step.action || step.action === "camera") ? presentationDetails(elements).frameByBox.get(step.elementId) : undefined;
    return (frameId && enterPresentationDetail(stops, arrived, frameId)) || arrived;
  }
  return exitPresentationDetail(elements, stops, position) ?? position;
}

/**
 * The step the camera frames at stop `index`: the camera stop at or before it within its
 * scene; fade steps keep the camera where it was. A stop on an element that opens a detail
 * page frames that element: walking forward it turns over at once, so the audience only sees
 * it when coming back -- out of the page, or backwards -- and then sees the topic just shown.
 * The player and the presenter view share it.
 */
export function presentationCameraStop(stops: PresentationStop[], index: number): PresentationStep | undefined {
  const scene = sceneOfStop(stops, index);
  for (let at = index; at >= 0; at--) {
    const stop = stops[at];
    if (stop?.sceneId === scene && (!stop.step.action || stop.step.action === "camera")) return stop.step;
  }
  // A detail page that opens on a fade still shows the page itself.
  return scene ? { id: `detail:${scene}`, elementId: scene } : undefined;
}

/**
 * What the camera frames at stop `index`: its camera stop's element, widened to take in what
 * fades in after it within the scene, so an entrance never happens off-screen. Null when the
 * scene has no camera stop yet (the player shows the whole scene).
 */
export function presentationStopBounds(elements: PresentationElement[], stops: PresentationStop[], index: number): PresentationBounds | null {
  const camera = presentationCameraStop(stops, index);
  const byId = new Map(elements.map((element) => [element.id, element]));
  const target = camera ? byId.get(camera.elementId) : undefined;
  if (!target) return null;
  const scene = sceneOfStop(stops, index);
  const boxes = [presentationCameraBounds(target)];
  for (let at = index; at >= 0 && stops[at]?.step !== camera; at--) {
    const { step, sceneId } = stops[at];
    const revealed = sceneId === scene && step.action === "fadeIn" ? byId.get(step.elementId) : undefined;
    if (revealed) boxes.push(presentationCameraBounds(revealed));
  }
  return unionBounds(boxes);
}

/**
 * The whole talk as a clicker walks it from the first overview stop: every detour into a
 * detail page on the path included, in order. Players without scenes of their own (the
 * offline file) step through this list.
 */
export function presentationTour(elements: PresentationElement[], stops: PresentationStop[]): PresentationPosition[] {
  const first = stops.findIndex((stop) => stop.sceneId === null);
  if (first < 0) return [];
  const tour: PresentationPosition[] = [{ index: first, returns: [] }];
  // Each stop is visited at most once per way in, so the walk always ends.
  for (let guard = 0; guard < stops.length * 4; guard++) {
    const next = stepPresentationPosition(elements, stops, tour.at(-1)!, 1);
    if (next.index === tour.at(-1)!.index) break;
    tour.push(next);
  }
  return tour;
}

/**
 * A stop's name for the presenter: the element's own words, or for a frame without a label
 * the first words on it, top to bottom -- a frame named "7" helps nobody mid-talk.
 */
export function presentationStopHeading(elements: PresentationElement[], target: PresentationElement, index: number): string {
  const own = presentationElementCaption(target);
  if (own || target.type !== "frame") return own || `${index + 1}`;
  const inside = presentationDescendants(elements, new Set([target.id]));
  const worded = elements.filter((element) => element.id !== target.id && inside.has(element.id) && presentationElementCaption(element))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  return worded.length ? presentationElementCaption(worded[0]).slice(0, 60) : `${index + 1}`;
}

/** The detail page of the element the current stop shows, if it has one. */
export function presentationStopDetail(elements: PresentationElement[], stops: PresentationStop[], index: number): string | null {
  const step = stops[index]?.step;
  return step ? presentationDetails(elements).frameByBox.get(step.elementId) ?? null : null;
}

/** "3 / 7" within the open scene. */
export function presentationScenePosition(stops: PresentationStop[], index: number): { current: number; total: number } {
  const scene = sceneOfStop(stops, index);
  const inScene = stops.map((stop, at) => ({ stop, at })).filter(({ stop }) => stop.sceneId === scene);
  return { current: inScene.findIndex(({ at }) => at === index) + 1, total: inScene.length };
}
