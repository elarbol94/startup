import { presentationAncestors, presentationCameraBounds, unionBounds, type PresentationElement } from "./presentation";
import { frameAtPoint } from "./presentation-hierarchy";

/** What a click on an element selects: the outermost group around it, or the element itself. */
export function selectionTargetId(elements: PresentationElement[], id: string): string {
  return presentationAncestors(elements, id).findLast((element) => element.type === "frame" && element.content.isGroup)?.id ?? id;
}

/** Shift/Ctrl/Cmd-click: adds the target, or removes it when it is already selected. */
export function toggleSelection(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
}

/**
 * Applies one batch of React Flow select changes. A change on a group member stands for its
 * group, which is what the canvas shows as selected. Deselects are applied before selects,
 * so a batch that deselects one node and selects another member of the same group keeps the
 * group; `preserved` ids (the selection an additive marquee started from) are never removed.
 */
export function applySelectChanges(
  elements: PresentationElement[],
  current: string[],
  changes: { id: string; selected: boolean }[],
  preserved: Iterable<string> = [],
): string[] {
  const keep = new Set(preserved);
  const added = new Set(changes.filter((change) => change.selected).map((change) => selectionTargetId(elements, change.id)));
  const removed = new Set<string>();
  for (const change of changes) {
    if (change.selected) continue;
    for (const id of [change.id, selectionTargetId(elements, change.id)]) if (!added.has(id) && !keep.has(id)) removed.add(id);
  }
  const next = current.filter((id) => !removed.has(id));
  for (const id of added) if (!next.includes(id)) next.push(id);
  return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
}

/**
 * A click on empty canvas: frames only paint their outline, so the section frame under the
 * point is selected (toggled with a modifier). Outside every frame a plain click clears the
 * selection and a modifier click keeps it.
 */
export function paneClickSelection(elements: PresentationElement[], current: string[], point: { x: number; y: number }, additive: boolean): string[] {
  const frame = frameAtPoint(elements, point);
  if (!frame) return additive ? current : [];
  const id = selectionTargetId(elements, frame.id);
  return additive ? toggleSelection(current, id) : [id];
}

/**
 * A right-click on empty canvas: inside the bounds of the current selection it keeps the
 * selection (a group's corner or a gap between selected objects is still "the selection"),
 * elsewhere it behaves like a plain click.
 */
export function contextMenuSelection(elements: PresentationElement[], current: string[], point: { x: number; y: number }): string[] {
  const box = unionBounds(elements.filter((element) => current.includes(element.id)).map(presentationCameraBounds));
  if (box && point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height) return current;
  return paneClickSelection(elements, current, point, false);
}
