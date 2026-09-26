// Section frames as containers and path stops: naming and adopting newly inserted
// elements, deleting a frame without its members, aspect presets and placing a new frame
// beside the path. Used by the presentation editor.
import { presentationCameraBounds } from "./presentation-geometry";
import { assignFrameMembership, isPresentationElementLocked, presentationDescendants } from "./presentation-hierarchy";
import type { PresentationBounds, PresentationElement, PresentationFrameElement, PresentationStep } from "./presentation-model";

/** A slide-like frame, as opposed to a group (a frame that only bundles objects). */
export const isSectionFrame = (element: PresentationElement): element is PresentationFrameElement =>
  element.type === "frame" && !element.content.isGroup;

/** Default size of a new frame: a 16:9 slide. */
export const PRESENTATION_FRAME_SIZE = { width: 960, height: 540 };
export const presentationFramePresets = [["16:9", 9 / 16], ["4:3", 3 / 4], ["1:1", 1]] as const;
export type PresentationFramePreset = (typeof presentationFramePresets)[number][0];

/** Height for a preset that keeps the frame's width, clamped to the valid element size. */
export function framePresetHeight(width: number, preset: PresentationFramePreset): number {
  const ratio = presentationFramePresets.find(([name]) => name === preset)![1];
  return Math.min(20_000, Math.max(20, Math.round(width * ratio * 100) / 100));
}

/** Highest "Rahmen N" in use plus one; `frameName` renders the localized label for N. */
export function nextFrameNumber(elements: PresentationElement[], frameName: (number: number) => string): number {
  let highest = 0;
  for (const element of elements) {
    if (element.type !== "frame") continue;
    const match = element.content.label.match(/(\d+)\s*$/);
    const number = match ? Number(match[1]) : 0;
    if (number > highest && frameName(number) === element.content.label.trim()) highest = number;
  }
  return highest + 1;
}

/**
 * Settles elements that were just added to the canvas: unnamed section frames among them
 * are named "Rahmen N", and each added root joins the frame its centre lands in.
 */
export function adoptInsertedElements(elements: PresentationElement[], addedIds: Iterable<string>, frameName: (number: number) => string): PresentationElement[] {
  const added = new Set(addedIds);
  let number = nextFrameNumber(elements, frameName);
  const named = elements.map((element) => added.has(element.id) && isSectionFrame(element) && !element.content.label.trim()
    ? { ...element, content: { ...element.content, label: frameName(number++) } } : element);
  const roots = named.filter((element) => added.has(element.id) && !(element.parentId && added.has(element.parentId))).map((element) => element.id);
  return assignFrameMembership(named, roots);
}

/** New stops for the section frames among `added`, appended in order and within the step cap. */
export function appendFrameStops(steps: PresentationStep[], added: PresentationElement[], id: () => string): PresentationStep[] {
  const stops = added.filter(isSectionFrame).map((frame) => ({ id: id(), elementId: frame.id }));
  return stops.length && steps.length < 500 ? [...steps, ...stops].slice(0, 500) : steps;
}

/**
 * What a delete removes: a section frame goes alone (its members stay on the canvas);
 * any other element, including a group, takes everything inside it.
 */
export function presentationRemovalSet(elements: PresentationElement[], ids: Iterable<string>): Set<string> {
  const removed = new Set<string>();
  for (const id of ids) {
    const element = elements.find((item) => item.id === id);
    if (!element || isPresentationElementLocked(elements, id)) continue;
    if (isSectionFrame(element)) removed.add(id);
    else for (const inner of presentationDescendants(elements, new Set([id]))) removed.add(inner);
  }
  return removed;
}

/** Removes elements; members of a removed frame move up to its nearest remaining ancestor. */
export function removePresentationElements(elements: PresentationElement[], removed: Set<string>): PresentationElement[] {
  if (!removed.size) return elements;
  const byId = new Map(elements.map((element) => [element.id, element]));
  const survivor = (id: string | undefined) => {
    const seen = new Set<string>();
    while (id && removed.has(id) && !seen.has(id)) { seen.add(id); id = byId.get(id)?.parentId; }
    return id && !removed.has(id) ? id : undefined;
  };
  return elements.filter((element) => !removed.has(element.id)).map((element) => {
    if (!element.parentId || !removed.has(element.parentId)) return element;
    const { parentId, ...rest } = element;
    const next = survivor(parentId);
    return (next ? { ...rest, parentId: next } : rest) as PresentationElement;
  });
}

const overlaps = (a: PresentationBounds, b: PresentationBounds) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/**
 * Where a frame placed "in the middle" goes instead of on top of an existing frame:
 * right of the path's last stop (or of the rightmost frame it hit) with a gap of 10 % of
 * its width, sliding further right past any frame still in the way.
 */
export function clearFramePlacement(elements: PresentationElement[], steps: PresentationStep[], frame: PresentationBounds): { x: number; y: number } {
  const frames = elements.filter(isSectionFrame).map(presentationCameraBounds);
  const hits = frames.filter((box) => overlaps(frame, box));
  if (!hits.length) return { x: frame.x, y: frame.y };
  const gap = frame.width * 0.1;
  const last = steps.map((step) => elements.find((element) => element.id === step.elementId)).findLast((element) => element !== undefined);
  const anchor = last ? presentationCameraBounds(last) : hits.reduce((right, box) => box.x + box.width > right.x + right.width ? box : right);
  const next = { ...frame, x: anchor.x + anchor.width + gap, y: anchor.y };
  for (let pass = 0; pass <= frames.length; pass++) {
    const blocking = frames.filter((box) => overlaps(next, box));
    if (!blocking.length) break;
    next.x = Math.max(...blocking.map((box) => box.x + box.width)) + gap;
  }
  return { x: next.x, y: next.y };
}

/** True when `bounds` lies entirely inside `view` (both in canvas coordinates). */
export function boundsVisible(bounds: PresentationBounds, view: PresentationBounds): boolean {
  return bounds.x >= view.x && bounds.y >= view.y && bounds.x + bounds.width <= view.x + view.width && bounds.y + bounds.height <= view.y + view.height;
}
