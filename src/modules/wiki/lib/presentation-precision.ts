import {
  applyGeometryChanges, isPresentationElementLocked, normalizeRotation,
  presentationAncestors, presentationDescendants, presentationElementsSchema,
  rotateElements, type PresentationElement,
} from "./presentation";
import { layoutRoots, type PresentationAlignment } from "./presentation-layout";

export type GeometryField = "x" | "y" | "width" | "height" | "rotation";
export const precisionFields: GeometryField[] = ["x", "y", "width", "height", "rotation"];
export const frameAlignments = ["left", "center", "right", "top", "middle", "bottom"] as const;
export function canEditGeometry(elements: PresentationElement[], element: PresentationElement) {
  return !isPresentationElementLocked(elements, element.id)
    && !(element.type === "shape" && element.content.connection);
}

/** Absolute canvas coordinates; invalid requests leave the complete tree untouched. */
export function setPreciseGeometry(elements: PresentationElement[], id: string, field: GeometryField, value: number, proportional: boolean): PresentationElement[] {
  const element = elements.find(e => e.id === id);
  if (!element || !canEditGeometry(elements, element) || !Number.isFinite(value)) return elements;
  if ((field === "width" || field === "height") && (value < 20 || value > 20_000)) return elements;
  if (field === "rotation" && (value < -360 || value > 360)) return elements;
  if (element[field] === value) return elements;
  let next: PresentationElement[];
  if (field === "rotation") {
    const rotation = normalizeRotation(value);
    if (element.rotation === rotation) return elements;
    next = rotateElements(elements, new Set([id]), rotation - element.rotation,
      { x: element.x + element.width / 2, y: element.y + element.height / 2 });
  } else {
    const change = { id, [field]: value, resizing: field === "width" || field === "height" };
    if (proportional && (field === "width" || field === "height")) {
      const other = field === "width" ? "height" : "width";
      Object.assign(change, { [other]: element[other] * value / element[field] });
    }
    next = applyGeometryChanges(elements, [change], 0, [], Number.EPSILON).elements;
  }
  return presentationElementsSchema.safeParse(next).success ? next : elements;
}

/** Nearest shared containing section; groups are objects, not slide boundaries. */
export function containingPresentationFrame(elements: PresentationElement[], ids: Set<string>) {
  const roots = layoutRoots(elements, ids);
  if (!roots.length) return undefined;
  const ancestors = roots.map(e => presentationAncestors(elements, e.id));
  return ancestors[0].find(e => e.type === "frame" && !e.content.isGroup
    && ancestors.every(chain => chain.some(parent => parent.id === e.id)));
}

/** Align visible bounds in the containing frame's own axes, including rotated frames. */
export function alignPresentationToFrame(elements: PresentationElement[], ids: Set<string>, mode: PresentationAlignment): PresentationElement[] {
  const frame = containingPresentationFrame(elements, ids);
  const roots = layoutRoots(elements, ids);
  if (!frame || !frameAlignments.some(value => value === mode) || roots.some(e => !canEditGeometry(elements, e))) return elements;
  const angle = frame.rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const center = { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  const horizontal = mode === "left" || mode === "center" || mode === "right";
  const moves = new Map<string, { x: number; y: number }>();
  for (const element of roots) {
    const dx = element.x + element.width / 2 - center.x, dy = element.y + element.height / 2 - center.y;
    const relative = (element.rotation - frame.rotation) * Math.PI / 180;
    const extent = horizontal
      ? Math.abs(Math.cos(relative)) * element.width + Math.abs(Math.sin(relative)) * element.height
      : Math.abs(Math.sin(relative)) * element.width + Math.abs(Math.cos(relative)) * element.height;
    const size = horizontal ? frame.width : frame.height;
    const target = mode === "center" || mode === "middle" ? 0
      : mode === "left" || mode === "top" ? (extent - size) / 2 : (size - extent) / 2;
    const delta = target - (horizontal ? cos * dx + sin * dy : -sin * dx + cos * dy);
    if (Math.abs(delta) < 0.000001) continue;
    const move = horizontal ? { x: cos * delta, y: sin * delta } : { x: -sin * delta, y: cos * delta };
    for (const id of presentationDescendants(elements, new Set([element.id]))) moves.set(id, move);
  }
  if (!moves.size) return elements;
  const next = elements.map(e => { const move = moves.get(e.id); return move ? { ...e, x: e.x + move.x, y: e.y + move.y } : e; });
  return presentationElementsSchema.safeParse(next).success ? next : elements;
}

/** Inspector display: at most one decimal, so dragged fractional geometry stays readable. */
export function formatGeometryValue(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}
