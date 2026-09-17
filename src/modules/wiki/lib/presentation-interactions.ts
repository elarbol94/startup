import { z } from "zod";
import { isPresentationElementLocked, presentationAncestors, presentationDescendants, presentationElementsSchema, type PresentationElement, type PresentationStep } from "./presentation";

export const isLinearShape = (element: PresentationElement) => element.type === "shape" && ["line", "arrow", "doubleArrow"].includes(element.content.shape);
export function adaptiveGridGap(zoom: number): number {
  return 24 * 2 ** Math.floor(Math.log2(1 / Math.max(0.02, zoom)));
}
export function selectionRoots(elements: PresentationElement[], ids: Iterable<string>): PresentationElement[] {
  const selected = new Set(ids);
  return elements.filter(e => selected.has(e.id) && !presentationAncestors(elements, e.id).some(p => selected.has(p.id)));
}
export function mutableSelection(elements: PresentationElement[], ids: Iterable<string>): boolean {
  const roots = selectionRoots(elements, ids);
  return roots.length > 0 && roots.every(e => !isPresentationElementLocked(elements, e.id));
}
export function lineEndpoints(element: PresentationElement) {
  const angle = element.rotation * Math.PI / 180, dx = Math.cos(angle) * element.width / 2, dy = Math.sin(angle) * element.width / 2;
  const center = { x: element.x + element.width / 2, y: element.y + element.height / 2 };
  return [{ x: center.x - dx, y: center.y - dy }, { x: center.x + dx, y: center.y + dy }] as const;
}
export function moveLineEndpoint(element: PresentationElement, endpoint: 0 | 1, point: { x: number; y: number }, constrain: boolean): PresentationElement {
  if (!isLinearShape(element) || (element.type === "shape" && element.content.connection)) return element;
  const fixed = lineEndpoints(element)[endpoint === 0 ? 1 : 0];
  let angle = Math.atan2(point.y - fixed.y, point.x - fixed.x);
  if (constrain) angle = Math.round(angle / (Math.PI / 4)) * Math.PI / 4;
  const width = Math.max(20, Math.min(20_000, Math.hypot(point.x - fixed.x, point.y - fixed.y)));
  const moved = { x: fixed.x + Math.cos(angle) * width, y: fixed.y + Math.sin(angle) * width };
  const rotation = (angle * 180 / Math.PI + (endpoint === 0 ? 180 : 0) + 360) % 360;
  return { ...element, width, rotation, x: (fixed.x + moved.x) / 2 - width / 2, y: (fixed.y + moved.y) / 2 - element.height / 2 };
}

export const presentationClipboardSchema = z.object({ kind: z.literal("management-presentation"), version: z.literal(1), elements: presentationElementsSchema });
export function serializeSelection(elements: PresentationElement[], ids: Iterable<string>) {
  const included = presentationDescendants(elements, new Set(selectionRoots(elements, ids).map(e => e.id)));
  return JSON.stringify({ kind: "management-presentation", version: 1, elements: elements.filter(e => included.has(e.id)).map(e => ({ ...e, parentId: e.parentId && included.has(e.parentId) ? e.parentId : undefined })) });
}
export function parsePresentationClipboard(raw: string) {
  if (raw.length > 5_000_000) throw new Error("Clipboard too large");
  return presentationClipboardSchema.parse(JSON.parse(raw)).elements;
}
export function pastePresentationObjects(copied: PresentationElement[], current: PresentationElement[], point: { x: number; y: number }, id: () => string) {
  if (!copied.length || current.length + copied.length > 500) throw new Error("Element limit");
  const ids = new Map(copied.map(e => [e.id, id()]));
  const left = Math.min(...copied.map(e => e.x)), top = Math.min(...copied.map(e => e.y));
  const right = Math.max(...copied.map(e => e.x + e.width)), bottom = Math.max(...copied.map(e => e.y + e.height));
  const next = copied.map(e => ({ ...structuredClone(e), id: ids.get(e.id)!,
    parentId: e.parentId ? ids.get(e.parentId) : undefined,
    x: e.x + point.x - (left + right) / 2, y: e.y + point.y - (top + bottom) / 2,
    ...(e.type === "shape" && e.content.connection ? { content: { ...e.content, connection: ids.has(e.content.connection.fromId) && ids.has(e.content.connection.toId) ? { fromId: ids.get(e.content.connection.fromId)!, toId: ids.get(e.content.connection.toId)! } : undefined } } : {}),
  } as PresentationElement));
  return { elements: presentationElementsSchema.parse([...current, ...next]), selectedIds: next.filter(e => !e.parentId).map(e => e.id) };
}
/** Replace group stops with equivalent child actions before removing group identities. */
export function ungroupSteps(steps: PresentationStep[], elements: PresentationElement[], groups: Set<string>, id: () => string): PresentationStep[] {
  return steps.flatMap(step => {
    if (!groups.has(step.elementId)) return [step];
    const children = elements.filter(e => e.parentId === step.elementId);
    // Retain camera-stop identity, notes and duration, targeting the first released child.
    if (step.action !== "fadeIn" && step.action !== "fadeOut") {
      return children.length ? [{ ...step, elementId: children[0].id }] : [];
    }
    return children.map((child, index) => ({ ...step, id: index ? id() : step.id, elementId: child.id }));
  });
}
export function reorderSelection(elements: PresentationElement[], ids: Iterable<string>, direction: "front" | "back" | "forward" | "backward") {
  const included = presentationDescendants(elements, new Set(selectionRoots(elements, ids).map(e => e.id)));
  const next = [...elements];
  if (direction === "front") return [...next.filter(e => !included.has(e.id)), ...next.filter(e => included.has(e.id))];
  if (direction === "back") return [...next.filter(e => included.has(e.id)), ...next.filter(e => !included.has(e.id))];
  if (direction === "forward") {
    for (let i = next.length - 2; i >= 0; i--) if (included.has(next[i].id) && !included.has(next[i + 1].id) && (next[i].type === "frame") === (next[i + 1].type === "frame")) [next[i], next[i + 1]] = [next[i + 1], next[i]];
  } else for (let i = 1; i < next.length; i++) if (included.has(next[i].id) && !included.has(next[i - 1].id) && (next[i].type === "frame") === (next[i - 1].type === "frame")) [next[i], next[i - 1]] = [next[i - 1], next[i]];
  return next;
}
