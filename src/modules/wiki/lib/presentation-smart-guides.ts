import type { PresentationBounds, SnapGuide } from "./presentation";

/** Match adjacent gaps on the same row/column, including a new object between peers. */
export function equalSpacing(bounds: PresentationBounds, targets: PresentationBounds[], tolerance: number) {
  const result = { ...bounds };
  const guides: SnapGuide[] = [];
  if (tolerance <= 0) return { bounds: result, guides };
  for (const axis of ["x", "y"] as const) {
    const size = axis === "x" ? "width" : "height", cross = axis === "x" ? "y" : "x", crossSize = axis === "x" ? "height" : "width";
    const candidates = targets.filter(b => Math.min(b[cross] + b[crossSize], bounds[cross] + bounds[crossSize]) > Math.max(b[cross], bounds[cross])
      && !(b.x <= bounds.x && b.y <= bounds.y && b.x + b.width >= bounds.x + bounds.width && b.y + b.height >= bounds.y + bounds.height));
    const peers = candidates.filter(b => !candidates.some(parent => parent !== b && parent.x <= b.x && parent.y <= b.y && parent.x + parent.width >= b.x + b.width && parent.y + parent.height >= b.y + b.height && (parent.width > b.width || parent.height > b.height)))
      .sort((a, b) => a[axis] - b[axis]);
    let best: { target: number; pairs: [number, number][]; cross: number } | undefined;
    const consider = (target: number, pairs: [number, number][], a: PresentationBounds, b: PresentationBounds) => {
      if (Math.abs(target - bounds[axis]) <= tolerance && (!best || Math.abs(target - bounds[axis]) < Math.abs(best.target - bounds[axis]))) {
        best = { target, pairs, cross: Math.max(bounds[cross] + bounds[crossSize], a[cross] + a[crossSize], b[cross] + b[crossSize]) + 12 };
      }
    };
    for (let i = 1; i < peers.length; i++) {
      const a = peers[i - 1], b = peers[i], end = a[axis] + a[size], gap = b[axis] - end;
      if (gap <= 0) continue;
      const after = b[axis] + b[size] + gap;
      consider(after, [[end, b[axis]], [b[axis] + b[size], after]], a, b);
      const before = a[axis] - gap - bounds[size];
      consider(before, [[before + bounds[size], a[axis]], [end, b[axis]]], a, b);
      const between = (gap - bounds[size]) / 2;
      if (between > 0) consider(end + between, [[end, end + between], [end + between + bounds[size], b[axis]]], a, b);
    }
    if (best) {
      result[axis] = best.target;
      for (const [start, end] of best.pairs) guides.push({ kind: "distance", axis: cross, position: best.cross, start, end, distance: end - start });
    }
  }
  return { bounds: result, guides };
}

export function snapRotation(angle: number, references: number[], shift = false, free = false) {
  if (free) return angle;
  if (shift) return Math.round(angle / 15) * 15;
  let result = angle, distance = 4;
  for (const target of [0, 90, ...references.flatMap(value => [value, value + 90])]) {
    const candidate = target + Math.round((angle - target) / 180) * 180;
    if (Math.abs(candidate - angle) <= distance) { result = candidate; distance = Math.abs(candidate - angle); }
  }
  return result;
}
