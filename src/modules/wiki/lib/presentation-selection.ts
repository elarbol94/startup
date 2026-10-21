import { presentationAncestors, presentationCameraBounds, unionBounds, type PresentationElement } from "./presentation";

const isGroup = (element: PresentationElement) => element.type === "frame" && Boolean(element.content.isGroup);

/**
 * The levels a click on `id` can select, outermost group first and the element itself last.
 * Section frames are not levels: like slides, they are selected by their outline or label.
 */
export function selectionPath(elements: PresentationElement[], id: string): string[] {
  return [...presentationAncestors(elements, id).filter(isGroup).map((element) => element.id).reverse(), id];
}

/**
 * What pressing an element selects. Normally its outermost group, like PowerPoint; once the
 * author is working inside a group (a member of it is selected), siblings inside that group
 * are selected directly instead of jumping back out to the group.
 */
export function selectionTargetId(elements: PresentationElement[], id: string, current: readonly string[] = []): string {
  const path = selectionPath(elements, id);
  const selectedPaths = current.map((selected) => selectionPath(elements, selected));
  for (let level = path.length - 2; level >= 0; level--) {
    if (selectedPaths.some((selected) => selected.length > level + 1 && selected[level] === path[level])) return path[level + 1];
  }
  return path[0];
}

/**
 * A plain click (not a drag) on an element: when the group around it is already selected,
 * the click drills one level in -- PowerPoint's "click again to select inside a group".
 */
export function drillSelectionTargetId(elements: PresentationElement[], id: string, current: readonly string[]): string {
  const path = selectionPath(elements, id);
  for (let level = path.length - 2; level >= 0; level--) if (current.includes(path[level])) return path[level + 1];
  return selectionTargetId(elements, id, current);
}

/**
 * What a drag of `id` moves: the nearest selected level around it, so a drilled-in group member
 * moves on its own while an unselected member drags its whole group.
 */
export function dragTargetId(elements: PresentationElement[], id: string, selected: ReadonlySet<string>): string {
  const path = selectionPath(elements, id);
  for (let level = path.length - 1; level >= 0; level--) if (selected.has(path[level])) return path[level];
  return path[0];
}

/** Escape inside a group selects the group around the selection; otherwise it clears. */
export function parentSelection(elements: PresentationElement[], current: readonly string[]): string[] {
  if (!current.length) return [];
  const path = selectionPath(elements, current[0]);
  return path.length > 1 ? [path[path.length - 2]] : [];
}

/** Shift/Ctrl/Cmd-click: adds the target, or removes it when it is already selected. */
export function toggleSelection(current: string[], id: string): string[] {
  return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
}

/**
 * Applies one batch of React Flow select changes. A change on a group member stands for the
 * level `selectionTargetId` resolves it to. Deselects are applied before selects, so a batch
 * that deselects one node and selects another member of the same group keeps the group;
 * a batch that only selects what is already selected changes nothing;
 * `preserved` ids (the selection an additive marquee started from) are never removed.
 */
export function applySelectChanges(
  elements: PresentationElement[],
  current: string[],
  changes: { id: string; selected: boolean }[],
  preserved: Iterable<string> = [],
): string[] {
  const keep = new Set(preserved);
  const added = new Set(changes.filter((change) => change.selected).map((change) => selectionTargetId(elements, change.id, current)));
  // Pressing a member of a selected group: React Flow selects the member alone and deselects
  // everything else, but the member stands for an already-selected group. Keeping the
  // selection lets the press drag the whole selection, like PowerPoint.
  if (added.size && [...added].every((id) => current.includes(id))) return current;
  const removed = new Set<string>();
  for (const change of changes) {
    if (change.selected) continue;
    for (const id of [change.id, selectionTargetId(elements, change.id, current)]) if (!added.has(id) && !keep.has(id)) removed.add(id);
  }
  const next = current.filter((id) => !removed.has(id));
  for (const id of added) if (!next.includes(id)) next.push(id);
  return next.length === current.length && next.every((id, index) => id === current[index]) ? current : next;
}

/**
 * A click on empty canvas, including the empty inside of a frame: like a click on empty slide
 * space in PowerPoint, it clears the selection. A modifier click keeps it. Frames are selected
 * through their outline or label.
 */
export function paneClickSelection(current: string[], additive: boolean): string[] {
  return additive ? current : [];
}

/**
 * A right-click on empty canvas: inside the bounds of the current selection it keeps the
 * selection (a group's corner or a gap between selected objects is still "the selection"),
 * elsewhere it behaves like a plain click.
 */
export function contextMenuSelection(elements: PresentationElement[], current: string[], point: { x: number; y: number }): string[] {
  const box = unionBounds(elements.filter((element) => current.includes(element.id)).map(presentationCameraBounds));
  if (box && point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height) return current;
  return paneClickSelection(current, false);
}
