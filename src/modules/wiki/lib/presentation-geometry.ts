// Bounding-box math for presentation elements: element/camera bounds, unions, print-page
// fitting and rotation normalisation. Re-exported by presentation.ts.
import { PRESENTATION_CAMERA_PADDING, type PresentationBounds, type PresentationElement } from "./presentation-model";

/**
 * Camera target for one element. Rotation is deliberately ignored: the frame a reader
 * lands on is the axis-aligned box the element occupies, which is what React Flow's
 * `fitBounds` consumes.
 */
export function elementBounds(element: PresentationElement): PresentationBounds {
  return { x: element.x, y: element.y, width: element.width, height: element.height };
}

/** Camera/export bounds include the corners of rotated elements; editing geometry keeps
 * using the unrotated box so dragging and snapping do not rewrite an element's size. */
export function presentationCameraBounds(element: PresentationElement): PresentationBounds {
  if (!element.rotation) return elementBounds(element);
  const radians = element.rotation * Math.PI / 180;
  const width = Math.abs(element.width * Math.cos(radians)) + Math.abs(element.height * Math.sin(radians));
  const height = Math.abs(element.width * Math.sin(radians)) + Math.abs(element.height * Math.cos(radians));
  return { x: element.x + (element.width - width) / 2, y: element.y + (element.height - height) / 2, width, height };
}

/** Takes anything box-shaped, so a selection of elements and a set of raw boxes both work. */
export function unionBounds(boxes: PresentationBounds[]): PresentationBounds | null {
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.width));
  const bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * A4 landscape at the CSS reference resolution of 96 dpi, which is what a printer hands
 * `@page { size: A4 landscape; margin: 0 }`. Keeping the page in px lets the export reuse
 * the canvas' own pixel geometry unchanged.
 */
export const PRESENTATION_PAGE_SIZE = { width: 1122.5, height: 793.7 };

export type PresentationPageTransform = { scale: number; offsetX: number; offsetY: number };

/**
 * The print equivalent of the player's `fitBounds`: pad the step's target, fit it to the
 * page, and centre it. A canvas point p lands at `p * scale + offset` on the page, so one
 * transform frames a whole page's worth of elements.
 */
export function fitBoundsToPage(
  bounds: PresentationBounds,
  page: { width: number; height: number } = PRESENTATION_PAGE_SIZE,
  padding: number = PRESENTATION_CAMERA_PADDING,
): PresentationPageTransform {
  const scale = Math.min(
    page.width / (Math.max(bounds.width, 1) * (1 + padding)),
    page.height / (Math.max(bounds.height, 1) * (1 + padding)),
  );
  return {
    scale,
    offsetX: page.width / 2 - (bounds.x + bounds.width / 2) * scale,
    offsetY: page.height / 2 - (bounds.y + bounds.height / 2) * scale,
  };
}

/** Rotation stays in the schema's [-360, 360] window and reads as the shortest turn. */
export function normalizeRotation(degrees: number): number {
  const normalized = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return Math.round(normalized * 1_000_000) / 1_000_000;
}
