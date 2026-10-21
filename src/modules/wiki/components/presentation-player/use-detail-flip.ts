// The turn between an element and its detail page, drawn with the live canvas only (nothing is
// copied, so text stays sharp and nothing pops):
//   in:  the camera glides into the element until it fills the screen, then the whole slide
//        turns over like a card, and its back is the detail page;
//   out: the page turns back over, landing on the element filling the screen, and the camera
//        glides out to where the talk was.
// While the slide is edge-on the scene underneath is switched, so each half shows one scene.
import { useCallback, useRef, type RefObject } from "react";
import { flushSync } from "react-dom";

/**
 * A browser that stops painting (a hidden or covered window, a projector that just took the
 * screen) stops animation frames and timelines too. A turn must never hang there, or every
 * key after it is dropped, so each wait gives up after a while and the turn just completes.
 */
const timeout = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const nextFrame = () => Promise.race([new Promise<void>((resolve) => requestAnimationFrame(() => resolve())), timeout(100)]);
const settle = (done: Promise<unknown>, ms: number) => Promise.race([done.then(() => undefined, () => undefined), timeout(ms + 250)]);

/** How far the card sinks back while it is edge-on: enough to read as depth, not as a zoom. */
const EDGE_SCALE = 0.86;
const pose = (angle: number) => `rotateY(${angle}deg) scale(${1 - (1 - EDGE_SCALE) * Math.abs(angle) / 90})`;

export function useDetailFlip({ containerRef, stageRef, surface, backdrop, durationMs, focusElement, frameCurrent }: {
  containerRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  /** The slide colour: the card's face while it turns. */
  surface: string;
  /** What shows behind the turning card: a little darker (or lighter) than the slide. */
  backdrop: string;
  durationMs: number;
  /** Fills the screen with an element, over `duration` ms. */
  focusElement: (id: string, duration: number) => Promise<unknown>;
  /** Frames the current stop, over `duration` ms. */
  frameCurrent: (duration: number) => Promise<unknown>;
}) {
  const busy = useRef(false);

  /**
   * Turns over to the detail page of `boxId` (in) or back to it (out); `commit` switches the
   * scene while the card is edge-on. Without motion it only switches, and the player frames it.
   */
  const flip = useCallback(async (direction: "in" | "out", boxId: string, commit: () => void) => {
    // A turn in progress finishes first; whatever asked to move meanwhile is dropped.
    if (busy.current) return;
    const stage = stageRef.current, container = containerRef.current;
    if (!stage || !container || durationMs <= 0) { flushSync(commit); return; }
    busy.current = true;
    // Marks the player while it turns, for tests and for anyone inspecting it.
    container.dataset.turning = direction;
    const glide = Math.round(durationMs * 0.65), half = Math.round(durationMs * 0.4);
    const turn = (from: number, to: number, easing: string) =>
      settle(stage.animate([{ transform: pose(from) }, { transform: pose(to) }], { duration: half, easing, fill: "forwards" }).finished, half);
    const sign = direction === "in" ? 1 : -1;
    const restore = () => {
      stage.getAnimations().forEach((animation) => animation.cancel());
      Object.assign(stage.style, { background: "", boxShadow: "" });
      container.style.background = "";
    };
    try {
      if (direction === "in") await settle(focusElement(boxId, glide), glide);
      // The card has a face and a shadow while it turns; the room behind it shows.
      Object.assign(stage.style, { background: surface, boxShadow: "0 30px 80px -20px rgb(0 0 0 / 0.45)", transformOrigin: "50% 50%" });
      container.style.background = backdrop;
      await turn(0, 90 * sign, "cubic-bezier(0.55, 0, 0.9, 0.45)");
      flushSync(commit);
      await nextFrame();
      await settle(direction === "in" ? frameCurrent(0) : focusElement(boxId, 0), 0);
      await nextFrame();
      await turn(-90 * sign, 0, "cubic-bezier(0.1, 0.55, 0.45, 1)");
      restore();
      if (direction === "out") await settle(frameCurrent(glide), glide);
    } finally {
      restore();
      delete container.dataset.turning;
      busy.current = false;
    }
  }, [backdrop, containerRef, durationMs, focusElement, frameCurrent, stageRef, surface]);

  const isFlipping = useCallback(() => busy.current, []);
  return { flip, isFlipping };
}
