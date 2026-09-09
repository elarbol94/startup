import { isPresentationElementLocked, presentationAncestors, presentationCameraBounds, presentationDescendants, type PresentationElement, type PresentationTextElement } from "./presentation";

export const presentationAlignments = ["left", "center", "right", "top", "middle", "bottom", "horizontal", "vertical"] as const;
export type PresentationAlignment = typeof presentationAlignments[number];
export function layoutRoots(elements: PresentationElement[], ids: Set<string>) {
  return elements.filter(e => ids.has(e.id) && !presentationAncestors(elements, e.id).some(parent => ids.has(parent.id)));
}
/** Align whole subtrees, never moving a selected child a second time. */
export function arrangePresentation(elements: PresentationElement[], ids: Set<string>, mode: PresentationAlignment): PresentationElement[] {
  const roots = layoutRoots(elements, ids);
  const distribute = mode === "horizontal" || mode === "vertical";
  if (roots.length < (distribute ? 3 : 2) || roots.some(e => isPresentationElementLocked(elements, e.id) || (e.type === "shape" && e.content.connection))) return elements;
  const horizontal = ["left", "center", "right", "horizontal"].includes(mode);
  const axis = horizontal ? "x" : "y", dimension = horizontal ? "width" : "height";
  const boxes = roots.map(e => ({ e, b: presentationCameraBounds(e) })).sort((a, b) => a.b[axis] - b.b[axis]);
  const start = Math.min(...boxes.map(({ b }) => b[axis]));
  const end = Math.max(...boxes.map(({ b }) => b[axis] + b[dimension]));
  const gap = (end - start - boxes.reduce((sum, { b }) => sum + b[dimension], 0)) / (boxes.length - 1);
  if (distribute && gap < 0) return elements;
  const moves = new Map<string, number>();
  let cursor = start;
  for (const { e, b } of boxes) {
    const target = distribute ? cursor : mode === "center" || mode === "middle" ? (start + end - b[dimension]) / 2 : mode === "right" || mode === "bottom" ? end - b[dimension] : start;
    const delta = target - b[axis];
    for (const id of presentationDescendants(elements, new Set([e.id]))) moves.set(id, delta);
    cursor += b[dimension] + gap;
  }
  let changed = false;
  const result = elements.map(e => { const delta = moves.get(e.id) ?? 0; if (Math.abs(delta) < 0.00001) return e; changed = true; return { ...e, [axis]: e[axis] + delta }; });
  return changed ? result : elements;
}

/** Conservative deterministic wrapping, shared by saved editor content and export. */
export function presentationTextFits(element: PresentationTextElement, size = element.content.fontSize): boolean {
  const c = element.content, padding = c.padding ?? 0;
  const width = element.width - padding * 2, height = element.height - padding * 2;
  if (width <= 0 || height < size * 1.15) return false;
  const text = c.runs?.map(run => run.text).join("") ?? c.text;
  // Use conservative glyph widths so fitting is stable across server/browser fonts.
  const weight = c.bold || c.runs?.some(run => run.bold) ? 1.08 : 1;
  const measure = (value: string) => [...value].reduce((sum, char) => sum + (/\s/u.test(char) ? 0.35 : /[MWmw@#%]/u.test(char) ? 1 : /[ilI.,'!:;]/u.test(char) ? 0.35 : char.codePointAt(0)! > 255 ? 1 : 0.66), 0) * size * weight;
  const available = width - (c.list && c.list !== "none" ? size * 2 : 0);
  if (available <= 0) return false;
  let lines = 0;
  for (const paragraph of text.split("\n")) {
    lines++;
    let used = 0;
    for (const token of paragraph.match(/\s+|\S+/gu) ?? []) {
      const length = measure(token);
      if (length <= available) {
        if (used + length > available) { lines++; used = 0; }
        used += length;
      } else {
        for (const char of token) {
          const advance = measure(char);
          if (advance > available) return false;
          if (used + advance > available) { lines++; used = 0; }
          used += advance;
        }
      }
    }
  }
  return lines * size * 1.15 <= height;
}
export function fitPresentationText(element: PresentationTextElement): PresentationTextElement {
  if (!element.content.autoFit) return element;
  const { minFontSize, maxFontSize } = element.content.autoFit;
  let size = minFontSize, low = minFontSize, high = maxFontSize;
  while (low <= high) {
    const candidate = Math.floor((low + high) / 2);
    if (presentationTextFits(element, candidate)) { size = candidate; low = candidate + 1; }
    else high = candidate - 1;
  }
  return size === element.content.fontSize ? element : { ...element, content: { ...element.content, fontSize: size } };
}

function endpoint(element: PresentationElement, target: PresentationElement) {
  const cx = element.x + element.width / 2, cy = element.y + element.height / 2;
  const angle = element.rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const dx = target.x + target.width / 2 - cx, dy = target.y + target.height / 2 - cy;
  const x = dx * cos + dy * sin, y = -dx * sin + dy * cos;
  const ellipse = (element.type === "frame" && element.content.shape === "circle") || (element.type === "shape" && element.content.shape === "ellipse");
  const denominator = ellipse ? Math.hypot(x / (element.width / 2), y / (element.height / 2)) : Math.max(Math.abs(x) / (element.width / 2), Math.abs(y) / (element.height / 2));
  if (!denominator) return { x: cx, y: cy };
  return { x: cx + (x * cos - y * sin) / denominator, y: cy + (x * sin + y * cos) / denominator };
}
/** Recompute derived geometry in the same undo step as a text or section edit. */
export function maintainPresentationLayout(elements: PresentationElement[]): PresentationElement[] {
  const byId = new Map(elements.map(e => [e.id, e]));
  let changed = false;
  const result = elements.map(e => {
    if (e.type === "text" && e.content.autoFit && !isPresentationElementLocked(elements, e.id)) {
      const fitted = fitPresentationText(e); changed ||= fitted !== e; return fitted;
    }
    if (e.type !== "shape" || !e.content.connection) return e;
    const from = byId.get(e.content.connection.fromId), to = byId.get(e.content.connection.toId);
    if (!from || !to || from.id === to.id || from.id === e.id || to.id === e.id || (from.type === "shape" && from.content.connection) || (to.type === "shape" && to.content.connection) || !["line", "arrow"].includes(e.content.shape)) {
      changed = true; return { ...e, content: { ...e.content, connection: undefined } };
    }
    const a = endpoint(from, to), b = endpoint(to, from);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const width = Math.min(20_000, Math.max(20, length));
    const x = (a.x + b.x) / 2 - width / 2, y = (a.y + b.y) / 2 - 10;
    const rotation = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    if (e.x === x && e.y === y && e.width === width && e.height === 20 && e.rotation === rotation) return e;
    changed = true; return { ...e, x, y, width, height: 20, rotation };
  });
  return changed ? result : elements;
}
