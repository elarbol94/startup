"use client";

import { ViewportPortal, useViewport } from "@xyflow/react";
import { CornerDownRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PresentationElement } from "../lib/presentation";

/** On-screen size of a badge, kept constant at every zoom. */
const BADGE_PX = 22;

/**
 * The editor's detail page handle: a small, quiet chip at the corner of the element under the
 * pointer or selected -- "open its page" when it has one, a dashed "+" to make one. Nothing is
 * drawn on elements the author is not pointing at, so the slide stays as the audience sees it.
 */
export function PresentationDetailBadges({ elements, frameByBox, showFor, createFor, onOpen, onHover, openLabel, createLabel }: {
  elements: PresentationElement[];
  frameByBox: Map<string, string>;
  /** Elements whose handle shows: the hovered and the selected ones. */
  showFor: Set<string>;
  createFor?: PresentationElement | null;
  onOpen: (boxId: string) => void;
  /** Keeps the handle up while the pointer moves from the element onto it. */
  onHover: (boxId: string | null) => void;
  openLabel: (box: PresentationElement) => string;
  createLabel: string;
}) {
  const { zoom } = useViewport();
  const size = BADGE_PX / zoom, gap = 4 / zoom, icon = size * 0.55;
  const boxes = elements.filter((element) => frameByBox.has(element.id) && showFor.has(element.id));
  const badge = (box: PresentationElement, kind: "open" | "create") => (
    <button key={`${kind}-${box.id}`} type="button" data-detail-badge={kind} data-element-id={box.id}
      aria-label={kind === "create" ? createLabel : openLabel(box)} title={kind === "create" ? createLabel : openLabel(box)}
      className={cn("nodrag nopan pointer-events-auto absolute grid place-items-center rounded-full border bg-background/95 text-muted-foreground shadow-sm transition-colors hover:text-foreground",
        kind === "create" && "border-dashed")}
      style={{ left: box.x + box.width + gap, top: box.y - size - gap, width: size, height: size, borderWidth: 1 / zoom, zIndex: 2100 }}
      onPointerEnter={() => onHover(box.id)} onPointerLeave={() => onHover(null)}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); onOpen(box.id); }}>
      {kind === "create" ? <Plus style={{ width: icon, height: icon }} /> : <CornerDownRight style={{ width: icon, height: icon }} />}
    </button>
  );
  return <ViewportPortal>
    {boxes.map((box) => badge(box, "open"))}
    {createFor && !frameByBox.has(createFor.id) && badge(createFor, "create")}
  </ViewportPortal>;
}
