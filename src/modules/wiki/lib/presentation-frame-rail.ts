import { stepTarget, type PresentationBounds, type PresentationElement, type PresentationStep } from "./presentation";
import { PRESENTATION_FRAME_SIZE } from "./presentation-frames";

/** Space left between a new frame and the one before it, like the gap between slides. */
export const FRAME_RAIL_GAP = 120;

const isSectionFrame = (element: PresentationElement) => element.type === "frame" && !element.content.isGroup;

/**
 * Where "New frame" in the frame rail puts the next frame: to the right of the last frame in
 * playback order, at its size -- the next slide after the last one. Without frames on the
 * path it follows the right-most frame, and on an empty canvas it starts at the origin.
 */
export function nextFrameBounds(elements: PresentationElement[], steps: PresentationStep[]): PresentationBounds {
  const onPath = steps.map((step) => stepTarget(step, elements)).filter((element): element is PresentationElement => Boolean(element && isSectionFrame(element)));
  const frames = elements.filter(isSectionFrame);
  const last = onPath.at(-1) ?? frames.reduce<PresentationElement | undefined>((best, frame) => !best || frame.x + frame.width > best.x + best.width ? frame : best, undefined);
  if (!last) return { x: 0, y: 0, ...PRESENTATION_FRAME_SIZE };
  // Step past any frame already sitting there, so repeated clicks never stack frames.
  let x = last.x + last.width + FRAME_RAIL_GAP;
  const overlaps = (left: number) => frames.some((frame) => frame.x < left + last.width && frame.x + frame.width > left && frame.y < last.y + last.height && frame.y + frame.height > last.y);
  while (overlaps(x)) x += last.width + FRAME_RAIL_GAP;
  return { x, y: last.y, width: last.width, height: last.height };
}
