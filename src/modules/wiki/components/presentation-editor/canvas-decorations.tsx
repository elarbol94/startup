"use client";
// Presentation canvas decorations drawn inside React Flow: the surface, the visible grid, snap/distance
// guides and the minimap node. Used by presentation-editor.tsx.
import { Background, ViewportPortal, useReactFlow, useViewport, type MiniMapNodeProps } from "@xyflow/react";
import type { SnapGuide } from "../../lib/presentation";
import { gridDisplayGap } from "../../lib/presentation-grid";
import type { PresentationNode } from "../presentation-canvas";

/** The plain canvas surface while gridlines are off: no dots, or switching the grid off still shows one. */
export function CanvasSurface({ surface }: { surface: string }) {
  // bgColor: React Flow otherwise paints the app theme's colour over the slide surface.
  return <Background bgColor={surface} color="transparent" />;
}

/**
 * View → Gridlines. React Flow's <Background> paints under the nodes, where a filled slide
 * hides it; PowerPoint draws the grid over the slide, so this layer sits above the objects
 * (with React Flow's panels; the guides and controls come later and stay on top) and lets
 * every pointer event through. Dots fall on multiples of the spacing from the canvas origin,
 * the points snapping uses.
 */
export function GridOverlay({ spacing, transparency = 0 }: { spacing: number; transparency?: number }) {
  const { x, y, zoom } = useViewport();
  const gap = gridDisplayGap(spacing, zoom) * zoom;
  const offset = (value: number) => ((value % gap) + gap) % gap;
  return (
    <svg data-testid="presentation-grid-overlay" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 5 }}>
      <pattern id="presentation-grid-overlay" width={gap} height={gap} x={offset(x)} y={offset(y)} patternUnits="userSpaceOnUse">
        {/* Dark dot with a light halo: visible on a white slide and on the dark canvas alike. */}
        <circle cx={0.75} cy={0.75} r={1.5} fill="#f8fafc" fillOpacity={0.5} />
        <circle cx={0.75} cy={0.75} r={0.9} fill="#475569" fillOpacity={0.85} />
      </pattern>
      <rect width="100%" height="100%" fill="url(#presentation-grid-overlay)" opacity={1 - transparency} />
    </svg>
  );
}

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
