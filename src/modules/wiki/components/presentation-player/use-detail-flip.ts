// The card turn between an element and its detail page. React Flow draws one scene at a time,
// so each half of the turn shows a still copy of what is leaving (the element, or the page)
// while the live canvas already shows what arrives:
//   in:  the element's copy turns edge-on while growing, then the live page turns face-on to
//        full size over a still copy of the overview;
//   out: a still copy of the page turns edge-on while shrinking over the live overview, then
//        the element's copy turns face-on back into its place.
import { useCallback, useRef, type RefObject } from "react";
import { flushSync } from "react-dom";

type Rect = { x: number; y: number; width: number; height: number };

const PERSPECTIVE = "perspective(1600px)";

const lerp = (a: Rect, b: Rect, t: number): Rect => ({
  x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, width: a.width + (b.width - a.width) * t, height: a.height + (b.height - a.height) * t,
});

/** Transform that makes an element laid out at `from` appear at `to`, turned by `angle` around its vertical axis. */
function toRect(from: Rect, to: Rect, angle: number): string {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2), dy = to.y + to.height / 2 - (from.y + from.height / 2);
  return `${PERSPECTIVE} translate(${dx}px, ${dy}px) scale(${to.width / from.width}, ${to.height / from.height}) rotateY(${angle}deg)`;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export function useDetailFlip({ containerRef, stageRef, getZoom, background, durationMs }: {
  containerRef: RefObject<HTMLDivElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  getZoom: () => number;
  background: string;
  durationMs: number;
}) {
  const busy = useRef(false);

  const nodeOf = useCallback((id: string) => stageRef.current?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`) ?? null, [stageRef]);

  /** An absolutely placed layer inside the player, in container coordinates. */
  const layer = useCallback((rect: Rect, container: DOMRect, zIndex: number) => {
    const element = document.createElement("div");
    element.setAttribute("aria-hidden", "true");
    element.dataset.detailFlip = "";
    Object.assign(element.style, { position: "absolute", left: `${rect.x - container.left}px`, top: `${rect.y - container.top}px`, width: `${rect.width}px`,
      height: `${rect.height}px`, zIndex: String(zIndex), pointerEvents: "none", transformOrigin: "center center", backfaceVisibility: "hidden", overflow: "hidden" });
    containerRef.current?.appendChild(element);
    return element;
  }, [containerRef]);

  /** A still copy of the whole canvas as it is drawn now. */
  const snapshot = useCallback((container: DOMRect, zIndex: number, hideId?: string) => {
    const flow = stageRef.current?.querySelector<HTMLElement>(".react-flow");
    const viewport = flow?.querySelector<HTMLElement>(".react-flow__viewport");
    const copy = layer({ x: container.left, y: container.top, width: container.width, height: container.height }, container, zIndex);
    copy.style.background = background || getComputedStyle(containerRef.current!).backgroundColor;
    if (flow && viewport) {
      const frame = document.createElement("div");
      frame.className = flow.className;
      Object.assign(frame.style, { position: "absolute", inset: "0", background: "transparent" });
      const clone = viewport.cloneNode(true) as HTMLElement;
      if (hideId) clone.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(hideId)}"]`)?.style.setProperty("visibility", "hidden");
      frame.appendChild(clone);
      copy.appendChild(frame);
    }
    return copy;
  }, [background, containerRef, layer, stageRef]);

  /** A still copy of one element at its place on screen. */
  const card = useCallback((node: HTMLElement, rect: Rect, container: DOMRect, zIndex: number) => {
    const flow = stageRef.current?.querySelector<HTMLElement>(".react-flow");
    const copy = layer(rect, container, zIndex);
    copy.style.overflow = "visible";
    const frame = document.createElement("div");
    frame.className = flow?.className ?? "";
    Object.assign(frame.style, { position: "absolute", inset: "0", background: "transparent", overflow: "visible" });
    const clone = node.cloneNode(true) as HTMLElement;
    Object.assign(clone.style, { position: "absolute", left: "0", top: "0", transform: `scale(${getZoom()})`, transformOrigin: "0 0", visibility: "visible", opacity: "1", animation: "none" });
    frame.appendChild(clone);
    copy.appendChild(frame);
    return copy;
  }, [getZoom, layer, stageRef]);

  /**
   * Turns the card while `commit` switches the scene. `commit` runs synchronously inside the
   * turn; without an element to turn (it is off screen, or motion is reduced) it just runs.
   */
  const flip = useCallback(async (direction: "in" | "out", boxId: string, commit: () => void) => {
    const container = containerRef.current?.getBoundingClientRect();
    const stage = stageRef.current;
    // A turn in progress finishes first; whatever asked to move meanwhile is dropped.
    if (busy.current) return;
    if (!container || !stage || durationMs <= 0) { flushSync(commit); return; }
    busy.current = true;
    const half = durationMs / 2;
    const full: Rect = { x: container.left, y: container.top, width: container.width, height: container.height };
    const cleanup: HTMLElement[] = [];
    try {
      if (direction === "in") {
        const node = nodeOf(boxId);
        const box = node?.getBoundingClientRect();
        if (!node || !box?.width || !box.height) { flushSync(commit); return; }
        const middle = lerp(box, full, 0.5);
        cleanup.push(snapshot(container, 0, boxId));
        const front = card(node, box, container, 3);
        cleanup.push(front);
        stage.style.opacity = "0";
        flushSync(commit);
        await front.animate([{ transform: `${PERSPECTIVE} rotateY(0deg)` }, { transform: toRect(box, middle, 90) }], { duration: half, easing: "ease-in", fill: "forwards" }).finished;
        front.remove();
        stage.style.background = background || getComputedStyle(containerRef.current!).backgroundColor;
        stage.style.opacity = "1";
        await stage.animate([{ transform: toRect(full, middle, -90) }, { transform: `${PERSPECTIVE} rotateY(0deg)` }], { duration: half, easing: "ease-out" }).finished;
      } else {
        cleanup.push(snapshot(container, 3));
        const back = cleanup[0];
        flushSync(commit);
        // The overview has to be drawn and framed before the element can be measured.
        await nextFrame(); await nextFrame(); await nextFrame();
        const node = nodeOf(boxId);
        const box = node?.getBoundingClientRect();
        if (!node || !box?.width || !box.height) {
          await back.animate([{ opacity: 1 }, { opacity: 0 }], { duration: half, fill: "forwards" }).finished;
          return;
        }
        const middle = lerp(box, full, 0.5);
        await back.animate([{ transform: `${PERSPECTIVE} rotateY(0deg)` }, { transform: toRect(full, middle, -90) }], { duration: half, easing: "ease-in", fill: "forwards" }).finished;
        back.remove();
        const front = card(node, box, container, 3);
        cleanup.push(front);
        node.style.visibility = "hidden";
        try {
          await front.animate([{ transform: toRect(box, middle, 90) }, { transform: `${PERSPECTIVE} rotateY(0deg)` }], { duration: half, easing: "ease-out", fill: "forwards" }).finished;
        } finally {
          node.style.visibility = "";
        }
      }
    } finally {
      for (const element of cleanup) element.remove();
      stage.style.opacity = "";
      stage.style.background = "";
      busy.current = false;
    }
  }, [background, card, containerRef, durationMs, nodeOf, snapshot, stageRef]);

  const isFlipping = useCallback(() => busy.current, []);
  return { flip, isFlipping };
}
