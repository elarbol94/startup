// Geometry edits on the presentation canvas: snapping, batched move/resize changes, and
// rotating/scaling selections. Re-exported by presentation.ts.
import { equalSpacing } from "./presentation-smart-guides";
import { normalizeRotation, presentationCameraBounds, unionBounds } from "./presentation-geometry";
import { isPresentationElementLocked, presentationAncestors, presentationDescendants } from "./presentation-hierarchy";
import type { PresentationBounds, PresentationElement } from "./presentation-model";

/** Smallest box an element may be dragged or scaled down to, shared with the canvas resizer. */
export const PRESENTATION_MIN_ELEMENT_SIZE = 40;

/** Snap distance in *screen* pixels; the caller divides by the zoom to get canvas units,
 * so the pull feels the same however far the author has zoomed out. */
export const PRESENTATION_SNAP_TOLERANCE = 6;

/** One alignment line to draw: `position` on `axis`, spanning `start`..`end` across it. */
export type SnapGuide = { kind?: "distance"; distance?: number; axis: "x" | "y"; position: number; start: number; end: number };

/** The three lines an edge can align to on one axis: near edge, centre, far edge. */
function linesOf(start: number, size: number): [number, number, number] {
  return [start, start + size / 2, start + size];
}

/**
 * One axis of the snap. A pure move offers all three of its own lines and shifts the whole
 * box; a resize offers only the edges that actually moved and drags just that edge, so
 * snapping the right edge never pulls the left one along.
 */
function snapAxis(
  prev: { start: number; size: number },
  next: { start: number; size: number },
  targets: { start: number; size: number }[],
  threshold: number,
  resizing: boolean,
  previousLine?: number,
): { start: number; size: number; line: number | null } {
  const sources = resizing
    ? [
      ...(Math.abs(next.start - prev.start) > 0.01 ? [next.start] : []),
      ...(Math.abs(next.start + next.size - (prev.start + prev.size)) > 0.01 ? [next.start + next.size] : []),
    ]
    : linesOf(next.start, next.size);

  let best: { delta: number; line: number; source: number; held: boolean } | null = null;
  for (const source of sources) {
    for (const target of targets) {
      for (const line of linesOf(target.start, target.size)) {
        const delta = line - source;
        const size = source === next.start ? next.size - delta : next.size + delta;
        if (resizing && (size < PRESENTATION_MIN_ELEMENT_SIZE || size > 20_000)) continue;
        const held = previousLine !== undefined && Math.abs(line - previousLine) < 0.01;
        if (Math.abs(delta) <= threshold * (held ? 1.5 : 1)
          && (!best || (held && !best.held) || (held === best.held && (Math.abs(delta) < Math.abs(best.delta) || (Math.abs(delta) === Math.abs(best.delta) && line < best.line))))) {
          best = { delta, line, source, held };
        }
      }
    }
  }
  if (!best) return { start: next.start, size: next.size, line: null };
  if (!resizing) return { start: next.start + best.delta, size: next.size, line: best.line };
  if (best.source === next.start) {
    const far = next.start + next.size;
    const size = Math.max(far - (next.start + best.delta), PRESENTATION_MIN_ELEMENT_SIZE);
    return { start: far - size, size, line: best.line };
  }
  return { start: next.start, size: Math.max(next.size + best.delta, PRESENTATION_MIN_ELEMENT_SIZE), line: best.line };
}

/**
 * Align a dragged or resized box to the edges and centres of the boxes that stayed put.
 * `prev` is what the box looked like before this gesture step, which is the only way to
 * tell a move from a resize — and a frame is just another target, so an element snaps
 * flush into a frame and back out of it with no special case.
 */
export function snapBounds(
  prev: PresentationBounds,
  next: PresentationBounds,
  targets: PresentationBounds[],
  threshold: number,
  resizing = Math.abs(next.width - prev.width) > 0.01 || Math.abs(next.height - prev.height) > 0.01,
  previousGuides: SnapGuide[] = [],
): { bounds: PresentationBounds; guides: SnapGuide[] } {
  if (threshold <= 0) return { bounds: { ...next }, guides: [] };
  const horizontal = snapAxis(
    { start: prev.x, size: prev.width },
    { start: next.x, size: next.width },
    targets.map((target) => ({ start: target.x, size: target.width })),
    threshold,
    resizing,
    previousGuides.find(g => !g.kind && g.axis === "x")?.position,
  );
  const vertical = snapAxis(
    { start: prev.y, size: prev.height },
    { start: next.y, size: next.height },
    targets.map((target) => ({ start: target.y, size: target.height })),
    threshold,
    resizing,
    previousGuides.find(g => !g.kind && g.axis === "y")?.position,
  );
  const bounds = { x: horizontal.start, y: vertical.start, width: horizontal.size, height: vertical.size };

  const guides: SnapGuide[] = [];
  if (horizontal.line !== null) {
    const matched = targets.filter((target) => linesOf(target.x, target.width).some((line) => Math.abs(line - horizontal.line!) < 0.01));
    guides.push({
      axis: "x",
      position: horizontal.line,
      start: Math.min(bounds.y, ...matched.map((target) => target.y)),
      end: Math.max(bounds.y + bounds.height, ...matched.map((target) => target.y + target.height)),
    });
  }
  if (vertical.line !== null) {
    const matched = targets.filter((target) => linesOf(target.y, target.height).some((line) => Math.abs(line - vertical.line!) < 0.01));
    guides.push({
      axis: "y",
      position: vertical.line,
      start: Math.min(bounds.x, ...matched.map((target) => target.x)),
      end: Math.max(bounds.x + bounds.width, ...matched.map((target) => target.x + target.width)),
    });
  }
  if (!resizing) {
    const spacing = equalSpacing(next, targets, threshold);
    for (const axis of ["x", "y"] as const) {
      const distanceGuides = spacing.guides.filter(g => g.axis === (axis === "x" ? "y" : "x"));
      const aligned = guides.find(g => !g.kind && g.axis === axis);
      const held = aligned && previousGuides.some(g => !g.kind && g.axis === axis && g.position === aligned.position);
      // Do not let a farther spacing suggestion override an exact edge/centre alignment.
      if (distanceGuides.length && (!aligned || (!held && Math.abs(spacing.bounds[axis] - next[axis]) < Math.abs(bounds[axis] - next[axis])))) {
        bounds[axis] = spacing.bounds[axis];
        for (let i = guides.length - 1; i >= 0; i--) if (!guides[i].kind && guides[i].axis === axis) guides.splice(i, 1);
        guides.push(...distanceGuides);
      } else if (distanceGuides.length && Math.abs(spacing.bounds[axis] - bounds[axis]) < 0.01) {
        guides.push(...distanceGuides);
      }
    }
  }
  return { bounds, guides };
}

/** Ignore renderer measurement noise; explicit numeric edits override this tolerance. */
const GEOMETRY_EPSILON = 0.5;

/** One element's new geometry as the canvas reports it; absent fields keep their value. */
export type PresentationGeometryChange = {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Handle gesture, including updates where snapping keeps the current size. */
  resizing?: boolean;
};

/**
 * Apply a batch of drag/resize changes with snapping. The batch is treated as one gesture:
 * the moving elements are aligned as a single box against everything that stayed put, so a
 * group keeps its arrangement and a lone element snaps on its own edges and centre.
 */
export function applyGeometryChanges(
  elements: PresentationElement[],
  changes: PresentationGeometryChange[],
  tolerance: number,
  previousGuides: SnapGuide[] = [],
  geometryEpsilon = GEOMETRY_EPSILON,
): { elements: PresentationElement[]; guides: SnapGuide[] } {
  const requested = new Set(changes.map((change) => change.id));
  const byId = new Map(changes.filter((change) => !isPresentationElementLocked(elements, change.id)
    && !presentationAncestors(elements, change.id).some((parent) => requested.has(parent.id))).map((change) => [change.id, change]));
  const moving = new Map<string, PresentationBounds>();
  for (const element of elements) {
    const change = byId.get(element.id);
    if (!change) continue;
    moving.set(element.id, {
      x: change.x ?? element.x,
      y: change.y ?? element.y,
      width: change.width ?? element.width,
      height: change.height ?? element.height,
    });
  }
  const before = unionBounds(elements.filter((element) => moving.has(element.id)));
  const after = unionBounds([...moving.values()]);
  if (!before || !after) return { elements, guides: [] };

  const affected = presentationDescendants(elements, new Set(moving.keys()));
  const targets = elements.filter((element) => !affected.has(element.id)
    && !(element.type === "shape" && element.content.connection)).map(presentationCameraBounds);
  const resizing = moving.size === 1 && ([...byId.values()].some((change) => change.resizing)
    || Math.abs(after.width - before.width) > 0.01 || Math.abs(after.height - before.height) > 0.01);
  const visibleBefore = resizing ? before : unionBounds(elements.filter(e => moving.has(e.id)).map(presentationCameraBounds))!;
  const visibleAfter = resizing ? after : unionBounds(elements.filter(e => moving.has(e.id)).map(e => presentationCameraBounds({ ...e, ...moving.get(e.id)! })))!;
  const snapped = snapBounds(visibleBefore, visibleAfter, targets, tolerance, resizing, previousGuides);
  // Only a resize changes the box's size, and a canvas resizes one element at a time, so
  // the snapped union *is* that element's box. A move shifts every mover by the same amount.
  const dx = snapped.bounds.x - visibleAfter.x;
  const dy = snapped.bounds.y - visibleAfter.y;

  let touched = false;
  const next = elements.map((element) => {
    const box = moving.get(element.id);
    if (!box) return element;
    // Explicit coordinates must not acquire cancellation error from union-bound arithmetic.
    const target = tolerance <= 0 ? box : resizing ? snapped.bounds : { ...box, x: box.x + dx, y: box.y + dy };
    if (
      Math.abs(target.x - element.x) < geometryEpsilon
      && Math.abs(target.y - element.y) < geometryEpsilon
      && Math.abs(target.width - element.width) < geometryEpsilon
      && Math.abs(target.height - element.height) < geometryEpsilon
    ) return element;
    touched = true;
    return { ...element, x: target.x, y: target.y, width: target.width, height: target.height };
  });
  if (!touched) return { elements, guides: snapped.guides };
  let nested = next;
  for (const parent of elements.filter((element) => byId.has(element.id) && element.type === "frame")) {
    // Section borders resize independently; explicit groups scale their contents.
    // Moving either kind of frame still carries its descendants.
    if (resizing && parent.type === "frame" && !parent.content.isGroup) continue;
    const updated = next.find((element) => element.id === parent.id)!;
    const children = presentationDescendants(elements, new Set([parent.id]));
    const sx = updated.width / parent.width;
    const sy = updated.height / parent.height;
    // Never save an invalid child size; rejecting the whole gesture preserves the hierarchy.
    if (elements.some((child) => child.id !== parent.id && children.has(child.id)
      && (child.width * sx < 20 || child.height * sy < 20 || child.width * sx > 20000 || child.height * sy > 20000))) return { elements, guides: [] };
    nested = nested.map((child) => child.id !== parent.id && children.has(child.id) ? {
      ...child, x: updated.x + (child.x - parent.x) * sx, y: updated.y + (child.y - parent.y) * sy,
      width: child.width * sx, height: child.height * sy,
    } : child);
  }
  return { elements: nested, guides: snapped.guides };
}

/**
 * Turn a selection around one point: every element spins on its own centre *and* orbits
 * the shared centre, so a group keeps its arrangement. For a single element the two
 * centres coincide and it simply spins in place.
 */
export function rotateElements(
  elements: PresentationElement[],
  ids: Set<string>,
  deltaDegrees: number,
  center: { x: number; y: number },
): PresentationElement[] {
  ids = presentationDescendants(elements, new Set([...ids].filter((id) => !isPresentationElementLocked(elements, id))));
  const radians = (deltaDegrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return elements.map((element) => {
    if (!ids.has(element.id)) return element;
    const dx = element.x + element.width / 2 - center.x;
    const dy = element.y + element.height / 2 - center.y;
    return {
      ...element,
      x: center.x + dx * cos - dy * sin - element.width / 2,
      y: center.y + dx * sin + dy * cos - element.height / 2,
      rotation: normalizeRotation(element.rotation + deltaDegrees),
    };
  });
}

/** Scale a selection about `origin` (the anchor corner held still by the drag). */
export function scaleElements(
  elements: PresentationElement[],
  ids: Set<string>,
  origin: { x: number; y: number },
  scaleX: number,
  scaleY: number,
): PresentationElement[] {
  ids = presentationDescendants(elements, new Set([...ids].filter((id) => !isPresentationElementLocked(elements, id))));
  if (!(scaleX > 0) || !(scaleY > 0) || !Number.isFinite(scaleX) || !Number.isFinite(scaleY)) return elements;
  // Clamp the shared scale, preserving the group's proportions and valid save geometry.
  const selected = elements.filter((element) => ids.has(element.id));
  if (!selected.length) return elements;
  scaleX = Math.min(Math.max(scaleX, ...selected.map((element) => PRESENTATION_MIN_ELEMENT_SIZE / element.width)), ...selected.map((element) => 20_000 / element.width));
  scaleY = Math.min(Math.max(scaleY, ...selected.map((element) => PRESENTATION_MIN_ELEMENT_SIZE / element.height)), ...selected.map((element) => 20_000 / element.height));
  // ponytail: the box scales, the font size does not — same as single-element resize.
  return elements.map((element) =>
    ids.has(element.id)
      ? {
        ...element,
        x: origin.x + (element.x - origin.x) * scaleX,
        y: origin.y + (element.y - origin.y) * scaleY,
        width: Math.max(element.width * scaleX, PRESENTATION_MIN_ELEMENT_SIZE),
        height: Math.max(element.height * scaleY, PRESENTATION_MIN_ELEMENT_SIZE),
      }
      : element,
  );
}
