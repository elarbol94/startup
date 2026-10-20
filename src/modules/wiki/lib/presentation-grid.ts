// PowerPoint's View → Grid and Guides for the presentation canvas: grid spacing choices, the
// ruler's origin and ticks, and grid/guide snapping. Canvas units are pt and the UI speaks cm.
// Evidence: docs/plans/presentation-powerpoint-formatting.md.
import type { PresentationBounds, PresentationElement } from "./presentation-model";
import { PRESENTATION_GRID_SPACING, type PresentationGuide } from "./presentation-format-model";
import { PRESENTATION_MIN_ELEMENT_SIZE, snapBounds, type SnapGuide } from "./presentation-transform";

/** One centimetre in canvas units (pt); the model's default grid spacing is exactly 1 cm. */
export const PRESENTATION_CM = PRESENTATION_GRID_SPACING;

/** The Spacing list of PowerPoint's dialog: n grids per cm, then whole centimetres. */
export const gridSpacingChoices: readonly { key: string; perCm?: number; cm?: number; spacing: number }[] = [
  ...[8, 6, 5, 4, 3, 2].map(perCm => ({ key: `perCm${perCm}`, perCm, spacing: PRESENTATION_CM / perCm })),
  ...[1, 2, 3, 4, 5].map(cm => ({ key: `cm${cm}`, cm, spacing: PRESENTATION_CM * cm })),
];

/** The list entry for `spacing`, or undefined when it is a custom value. */
export function gridSpacingChoice(spacing: number) {
  return gridSpacingChoices.find(choice => Math.abs(choice.spacing - spacing) < 1e-6);
}

/** PowerPoint's first "Display drawing guides": one vertical and one horizontal through the centre. */
export function defaultGuides(center: { x: number; y: number }, createId: () => string): PresentationGuide[] {
  return [{ id: createId(), axis: "x", position: center.x }, { id: createId(), axis: "y", position: center.y }];
}

const isSlide = (element: PresentationElement) => element.type === "frame" && !element.content.isGroup;
const centerOf = (box: PresentationBounds) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

/**
 * PowerPoint's ruler counts from the slide's centre. On an infinite canvas the "slide" is the
 * frame under the viewport centre (the innermost, for nested ones), else the nearest frame.
 */
export function rulerOrigin(elements: PresentationElement[], viewportCenter: { x: number; y: number }): { x: number; y: number } {
  const frames = elements.filter(isSlide);
  const { x, y } = viewportCenter;
  const containing = frames.filter(f => x >= f.x && x <= f.x + f.width && y >= f.y && y <= f.y + f.height)
    .sort((a, b) => a.width * a.height - b.width * b.height);
  if (containing.length) return centerOf(containing[0]);
  let best: { frame: PresentationElement; distance: number } | null = null;
  for (const frame of frames) {
    const dx = Math.max(frame.x - x, 0, x - frame.x - frame.width), dy = Math.max(frame.y - y, 0, y - frame.y - frame.height);
    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) best = { frame, distance };
  }
  return best ? centerOf(best.frame) : { x: 0, y: 0 };
}

export type RulerTick = { position: number; kind: "major" | "mid" | "minor"; label?: number };

/** Minimum screen distance between ruler labels and between minor ticks. */
const LABEL_GAP = 40;
const TICK_GAP = 5;

/**
 * Ticks for the canvas range `start`..`end` (canvas units, already relative to the ruler origin):
 * labelled ticks every n cm, n being the smallest of 1, 2, 5, 10, … that keeps labels
 * ≥ 40 px apart, and finer ticks between them while they stay ≥ 5 px apart. Labels are cm.
 */
export function rulerTicks(start: number, end: number, zoom: number): RulerTick[] {
  if (!(zoom > 0) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const cmPx = PRESENTATION_CM * zoom;
  let step = 1;
  for (let i = 0; step * cmPx < LABEL_GAP && i < 30; i++) step *= [2, 2.5, 2][i % 3];
  // Subdivisions: quarters/halves of a centimetre like PowerPoint, fifths/halves of larger steps.
  const divisions = step === 1 ? [4, 2] : String(step)[0] === "2" ? [4, 2] : [5, 2];
  const division = divisions.find(n => (step / n) * cmPx >= TICK_GAP) ?? 1;
  const unit = (step / division) * PRESENTATION_CM;
  // The epsilon keeps a range that ends exactly on a tick from losing it to rounding.
  const first = Math.ceil(start / unit - 1e-9), last = Math.floor(end / unit + 1e-9);
  if (last - first > 5000) return [];
  const ticks: RulerTick[] = [];
  for (let i = first; i <= last; i++) {
    const position = i * unit + 0;
    const index = ((i % division) + division) % division;
    if (index === 0) ticks.push({ position, kind: "major", label: Math.round((i / division) * step * 1e6) / 1e6 + 0 });
    else ticks.push({ position, kind: division % 2 === 0 && index === division / 2 ? "mid" : "minor" });
  }
  return ticks;
}

/** Grid lines drawn on screen: the spacing doubled until they are ≥ 8 px apart, so a zoomed-out
 * canvas does not turn grey. Snapping still uses the real spacing. */
export function gridDisplayGap(spacing: number, zoom: number): number {
  let gap = spacing;
  for (let i = 0; gap * zoom < 8 && i < 40; i++) gap *= 2;
  return gap;
}

/** Distance in cm for a guide label, two decimals in the reader's locale ("4,50" / "4.50"). */
export function formatCentimetres(value: number, locale: string): string {
  return value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function snapToGrid(value: number, spacing: number): number {
  if (!(spacing > 0)) return value;
  // Normalise -0 so callers comparing with Object.is or serialising see 0.
  return Math.round(value / spacing) * spacing + 0;
}

/**
 * Snap a dragged box to the grid. A move puts its top-left corner on the nearest grid point
 * (always: the grid has no tolerance); a resize snaps only the edges that moved, unless that
 * would shrink the box below the minimum element size.
 */
export function snapBoxToGrid(prev: PresentationBounds, next: PresentationBounds, spacing: number, resizing: boolean): PresentationBounds {
  if (!(spacing > 0)) return { ...next };
  if (!resizing) return { ...next, x: snapToGrid(next.x, spacing), y: snapToGrid(next.y, spacing) };
  const axis = (start: number, size: number, prevStart: number, prevSize: number) => {
    let a = start, b = start + size;
    if (Math.abs(a - prevStart) > 0.01) { const snapped = snapToGrid(a, spacing); if (b - snapped >= PRESENTATION_MIN_ELEMENT_SIZE) a = snapped; }
    if (Math.abs(b - (prevStart + prevSize)) > 0.01) { const snapped = snapToGrid(b, spacing); if (snapped - a >= PRESENTATION_MIN_ELEMENT_SIZE) b = snapped; }
    return [a, b - a] as const;
  };
  const [x, width] = axis(next.x, next.width, prev.x, prev.width);
  const [y, height] = axis(next.y, next.height, prev.y, prev.height);
  return { x, y, width, height };
}

export type PresentationSnapOptions = { grid?: number; guides?: { x: number[]; y: number[] }; smart?: boolean };

/** The guide positions of a guide list, split by axis, for `PresentationSnapOptions.guides`. */
export function guideLines(guides: PresentationGuide[]): { x: number[]; y: number[] } {
  return { x: guides.filter(g => g.axis === "x").map(g => g.position), y: guides.filter(g => g.axis === "y").map(g => g.position) };
}

/** Snap a box to the grid and to drawing guides only (no other elements): the same rules as a
 * canvas drag with smart guides off. `tolerance` is in canvas units. */
export function snapBoxToGridAndGuides(
  prev: PresentationBounds,
  next: PresentationBounds,
  options: { grid?: number; guides?: { x: number[]; y: number[] } },
  tolerance: number,
  resizing = Math.abs(next.width - prev.width) > 0.01 || Math.abs(next.height - prev.height) > 0.01,
): { bounds: PresentationBounds; guides: SnapGuide[] } {
  return snapBounds(prev, next, [], tolerance, resizing, [], { ...options, smart: false });
}
