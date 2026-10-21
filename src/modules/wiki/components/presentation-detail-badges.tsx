"use client";

import { ViewportPortal, useViewport } from "@xyflow/react";
import { Check, CornerDownRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PresentationElement } from "../lib/presentation";

/** On-screen size of a badge, kept constant at every zoom. */
const BADGE_PX = 26;

/**
 * The corner badge of every element that opens a detail page: the editor opens the page from
 * it, the player marks pages already shown with a tick. `createFor` adds a dashed "+" badge on
 * a selected element that has no page yet, so making one is a single click.
 */
export function PresentationDetailBadges({ elements, frameByBox, visited, hiddenIds, createFor, onOpen, openLabel, createLabel }: {
  elements: PresentationElement[];
  frameByBox: Map<string, string>;
  visited?: Set<string>;
  hiddenIds?: Set<string>;
  createFor?: PresentationElement | null;
  onOpen?: (boxId: string) => void;
  openLabel: (box: PresentationElement) => string;
  createLabel?: string;
}) {
  const { zoom } = useViewport();
  const size = BADGE_PX / zoom, gap = 4 / zoom;
  const boxes = elements.filter((element) => frameByBox.has(element.id) && !hiddenIds?.has(element.id));
  const badge = (box: PresentationElement, kind: "open" | "visited" | "create") => (
    <button key={`${kind}-${box.id}`} type="button" data-detail-badge={kind} data-element-id={box.id}
      aria-label={kind === "create" ? createLabel : openLabel(box)} title={kind === "create" ? createLabel : openLabel(box)}
      className={cn("nodrag nopan pointer-events-auto absolute grid place-items-center rounded-full shadow-md transition-transform hover:scale-110",
        kind === "create" ? "border-2 border-dashed border-indigo-500 bg-background text-indigo-600" : "bg-indigo-600 text-white",
        kind === "visited" && "bg-emerald-600")}
      // Just outside the top-right corner, clear of the editor's corner resize handle.
      style={{ left: box.x + box.width + gap, top: box.y - size - gap, width: size, height: size, zIndex: 2100 }}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); onOpen?.(box.id); }}>
      {kind === "visited" ? <Check style={{ width: size * 0.55, height: size * 0.55 }} />
        : kind === "create" ? <Plus style={{ width: size * 0.55, height: size * 0.55 }} />
          : <CornerDownRight style={{ width: size * 0.55, height: size * 0.55 }} />}
    </button>
  );
  return <ViewportPortal>
    {boxes.map((box) => badge(box, visited?.has(box.id) ? "visited" : "open"))}
    {createFor && !frameByBox.has(createFor.id) && badge(createFor, "create")}
  </ViewportPortal>;
}
