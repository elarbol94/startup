// Element ordering, duplication, frame nesting, locking and grouping on the presentation
// canvas. Re-exported by presentation.ts.
import { presentationCameraBounds, unionBounds } from "./presentation-geometry";
import type { PresentationElement, PresentationFrameElement } from "./presentation-model";

/**
 * Z-order is the order of the array: the last element of its band paints on top. Frames
 * keep their own band behind everything else (see `elementsToNodes`), so bringing a frame
 * to the front raises it above other frames, not above the content sitting inside it.
 */
export function reorderElement(
  elements: PresentationElement[],
  id: string,
  to: "front" | "back",
): PresentationElement[] {
  const index = elements.findIndex((element) => element.id === id);
  if (index < 0) return elements;
  const rest = elements.filter((element) => element.id !== id);
  return to === "front" ? [...rest, elements[index]] : [elements[index], ...rest];
}

/** Offset so the copy is visibly its own element rather than hiding under the original. */
export const PRESENTATION_DUPLICATE_OFFSET = 24;

export function duplicateElement(
  elements: PresentationElement[],
  id: string,
  newId: string,
): { elements: PresentationElement[]; element: PresentationElement | null } {
  const source = elements.find((element) => element.id === id);
  if (!source) return { elements, element: null };
  const copy: PresentationElement = {
    ...source,
    id: newId,
    x: source.x + PRESENTATION_DUPLICATE_OFFSET,
    y: source.y + PRESENTATION_DUPLICATE_OFFSET,
    content: { ...source.content },
  } as PresentationElement;
  return { elements: [...elements, copy], element: copy };
}

/** Absolute geometry is retained for backwards compatibility and identical exports. */
export function presentationAncestors(elements: PresentationElement[], id: string): PresentationElement[] {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const result: PresentationElement[] = [];
  const seen = new Set([id]);
  let parent = byId.get(id)?.parentId;
  while (parent && !seen.has(parent)) {
    seen.add(parent);
    const element = byId.get(parent);
    if (!element) break;
    result.push(element); parent = element.parentId;
  }
  return result;
}

export function presentationDescendants(elements: PresentationElement[], ids: Set<string>): Set<string> {
  const result = new Set(ids);
  for (let pass = 0; pass < elements.length; pass++) {
    let added = false;
    for (const element of elements) if (element.parentId && result.has(element.parentId) && !result.has(element.id)) {
      result.add(element.id); added = true;
    }
    if (!added) break;
  }
  return result;
}

export function isPresentationElementLocked(elements: PresentationElement[], id: string): boolean {
  return Boolean(elements.find((element) => element.id === id)?.locked || presentationAncestors(elements, id).some((element) => element.locked));
}

export function groupPresentationElements(elements: PresentationElement[], ids: Set<string>, groupId: string): PresentationElement[] {
  const selected = elements.filter((element) => ids.has(element.id) && !isPresentationElementLocked(elements, element.id));
  const roots = selected.filter((element) => !presentationAncestors(elements, element.id).some((parent) => ids.has(parent.id)));
  const bounds = unionBounds(roots);
  if (!bounds || roots.length < 2 || elements.length >= 500) return elements;
  const parentId = roots.every((element) => element.parentId === roots[0].parentId) ? roots[0].parentId : undefined;
  const rootIds = new Set(roots.map((element) => element.id));
  return [...elements.map((element) => rootIds.has(element.id) ? { ...element, parentId: groupId } : element), {
    id: groupId, type: "frame", ...bounds, rotation: 0, parentId,
    content: { label: "", shape: "none", color: "", isGroup: true },
  }];
}

export function ungroupPresentationElements(elements: PresentationElement[], id: string): PresentationElement[] {
  const group = elements.find((element) => element.id === id);
  if (group?.type !== "frame" || !group.content.isGroup || isPresentationElementLocked(elements, id)) return elements;
  return elements.filter((element) => element.id !== id).map((element) => element.parentId === id ? { ...element, parentId: group.parentId } : element);
}

export function duplicatePresentationTree(elements: PresentationElement[], ids: Set<string>, idMap: Map<string, string>): PresentationElement[] {
  const included = presentationDescendants(elements, ids);
  const copies = elements.filter((element) => included.has(element.id)).map((element) => ({
    ...element, id: idMap.get(element.id)!, locked: false,
    parentId: element.parentId ? idMap.get(element.parentId) ?? element.parentId : undefined,
    x: element.x + PRESENTATION_DUPLICATE_OFFSET, y: element.y + PRESENTATION_DUPLICATE_OFFSET,
    ...(element.type === "shape" && element.content.connection ? { content: { ...element.content, connection: { fromId: idMap.get(element.content.connection.fromId) ?? element.content.connection.fromId, toId: idMap.get(element.content.connection.toId) ?? element.content.connection.toId } } } : {}),
  } as PresentationElement));
  return elements.length + copies.length <= 500 ? [...elements, ...copies] : elements;
}

const area = (element: PresentationElement) => element.width * element.height;

/**
 * The section frame under a canvas point: the smallest (by area) non-group frame whose
 * axis-aligned bounds contain it. `exclude` drops those ids and everything inside them,
 * `minArea` drops frames that are not larger than what is being dropped.
 */
export function frameAtPoint(
  elements: PresentationElement[],
  point: { x: number; y: number },
  { exclude = [], minArea = 0 }: { exclude?: Iterable<string>; minArea?: number } = {},
): PresentationFrameElement | null {
  const excluded = presentationDescendants(elements, new Set(exclude));
  let best: PresentationFrameElement | null = null;
  for (const element of elements) {
    if (element.type !== "frame" || element.content.isGroup || excluded.has(element.id) || area(element) <= minArea) continue;
    const box = presentationCameraBounds(element);
    if (point.x < box.x || point.x > box.x + box.width || point.y < box.y || point.y > box.y + box.height) continue;
    if (!best || area(element) <= area(best)) best = element;
  }
  return best;
}

/**
 * Frame membership follows where an element is dropped or created: its centre inside a
 * section frame joins that frame, outside of every frame releases it. Only the given
 * roots are considered; group children, locked elements, connectors (which follow their
 * objects) and wiki-linked frames (whose parent is document structure) keep their parent.
 */
export function assignFrameMembership(elements: PresentationElement[], rootIds: Iterable<string>): PresentationElement[] {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const parents = new Map<string, string | undefined>();
  for (const id of new Set(rootIds)) {
    const element = byId.get(id);
    if (!element || isPresentationElementLocked(elements, id) || (element.type === "frame" && element.source)
      || (element.type === "shape" && element.content.connection)) continue;
    const parent = element.parentId ? byId.get(element.parentId) : undefined;
    if (parent?.type === "frame" && parent.content.isGroup) continue;
    const target = frameAtPoint(elements, { x: element.x + element.width / 2, y: element.y + element.height / 2 }, { exclude: [id], minArea: area(element) });
    if (target?.id !== element.parentId) parents.set(id, target?.id);
  }
  if (!parents.size) return elements;
  return elements.map((element) => {
    if (!parents.has(element.id)) return element;
    const parentId = parents.get(element.id);
    if (parentId) return { ...element, parentId };
    const released = { ...element };
    delete released.parentId;
    return released;
  });
}
