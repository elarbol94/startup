import type { PresentationBounds } from "./presentation";

/** A gesture never scales the selection away to nothing or turns it inside out. */
export const MIN_SELECTION_SCALE = 0.02;

/**
 * The scale a multi-selection handle drag asks for, relative to the box at gesture start.
 * `handle` is the dragged handle as -1/0/1 per axis (corner or edge); the opposite side stays
 * put, or the centre with `centered` (Alt). Shift on a corner keeps the proportions. Factors
 * are absolute -- not relative to the previous pointer move -- so clamping in `scaleElements`
 * cannot make the selection drift away from the pointer.
 */
export function selectionScale(
  start: PresentationBounds,
  handle: { x: number; y: number },
  point: { x: number; y: number },
  proportional: boolean,
  centered: boolean,
): { scaleX: number; scaleY: number; origin: { x: number; y: number } } {
  const origin = {
    x: centered ? start.x + start.width / 2 : handle.x === -1 ? start.x + start.width : start.x,
    y: centered ? start.y + start.height / 2 : handle.y === -1 ? start.y + start.height : start.y,
  };
  const span = (size: number) => (centered ? size / 2 : size) || 1;
  const axis = (direction: number, pointer: number, anchor: number, size: number) =>
    direction === 0 ? 1 : Math.max((direction * (pointer - anchor)) / span(size), MIN_SELECTION_SCALE);
  let scaleX = axis(handle.x, point.x, origin.x, start.width);
  let scaleY = axis(handle.y, point.y, origin.y, start.height);
  if (proportional && handle.x !== 0 && handle.y !== 0) scaleX = scaleY = Math.max(scaleX, scaleY);
  return { scaleX, scaleY, origin };
}
