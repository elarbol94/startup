"use client";
// Presentation canvas decorations drawn inside React Flow: snap/distance guides and the
// minimap node. Used by presentation-editor.tsx.
import { ViewportPortal, useReactFlow, useViewport, type MiniMapNodeProps } from "@xyflow/react";
import type { SnapGuide } from "../../lib/presentation";
import type { PresentationNode } from "../presentation-canvas";

/** Alignment lines are drawn in canvas coordinates, so they stay glued to the elements
 * they describe while the author pans and zooms. */
export function SnapGuides({ guides }: { guides: SnapGuide[] }) {
  const { zoom } = useViewport();
  if (!guides.length) return null;
  return (
    <ViewportPortal>
      {guides.map((guide) => (
        <div
          key={`${guide.kind ?? "align"}-${guide.axis}-${guide.position}-${guide.start}`}
          data-testid={guide.kind === "distance" ? "presentation-distance-guide" : "presentation-snap-guide"}
          className="pointer-events-none absolute"
          style={
            guide.axis === "x"
              ? { left: guide.position, top: guide.start, width: 1 / zoom, height: guide.end - guide.start, zIndex: 1900, background: guide.kind === "distance" ? "#6366f1" : `repeating-linear-gradient(to bottom, #f43f5e 0 ${4 / zoom}px, transparent ${4 / zoom}px ${7 / zoom}px)` }
              : { left: guide.start, top: guide.position, height: 1 / zoom, width: guide.end - guide.start, zIndex: 1900, background: guide.kind === "distance" ? "#6366f1" : `repeating-linear-gradient(to right, #f43f5e 0 ${4 / zoom}px, transparent ${4 / zoom}px ${7 / zoom}px)` }
          }
        >{guide.kind === "distance" && <>
          <span className="absolute bg-indigo-500" style={guide.axis === "y" ? { width: 1 / zoom, height: 8 / zoom, top: -4 / zoom } : { height: 1 / zoom, width: 8 / zoom, left: -4 / zoom }} />
          <span className="absolute bg-indigo-500" style={guide.axis === "y" ? { width: 1 / zoom, height: 8 / zoom, top: -4 / zoom, right: 0 } : { height: 1 / zoom, width: 8 / zoom, left: -4 / zoom, bottom: 0 }} />
          <span className="absolute rounded bg-background px-1 text-indigo-600" style={{ fontSize: 11 / zoom, left: guide.axis === "y" ? "50%" : 5 / zoom, top: guide.axis === "y" ? 3 / zoom : "50%" }}>{Math.round(guide.distance ?? 0)}</span>
        </>}</div>
      ))}
    </ViewportPortal>
  );
}

export function PresentationMiniMapNode(props: MiniMapNodeProps) {
  const { getNode } = useReactFlow<PresentationNode>();
  const element = getNode(props.id)?.data.element;
  return <rect data-testid="presentation-minimap-object" x={props.x} y={props.y} width={props.width} height={props.height}
    fill={element?.type === "frame" ? "none" : props.selected ? "#6366f1" : "#818cf8"}
    stroke={props.selected ? "#6366f1" : "#64748b"} strokeWidth={props.selected ? 2 : 1} vectorEffect="non-scaling-stroke"
    transform={element?.rotation ? `rotate(${element.rotation} ${props.x + props.width / 2} ${props.y + props.height / 2})` : undefined} />;
}
