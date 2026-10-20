// SVG paint servers and effect filters for a shape's Format-pane settings: gradient, pattern and
// picture fills, and one filter combining soft edges, glow, outer and inner shadow and a bevel
// highlight. Used by presentation-shape.tsx; pure, so it also renders in print and offline HTML.
import type { SVGProps } from "react";
import type { PresentationElement } from "../lib/presentation";
import type { PresentationEffects, PresentationFillStyle } from "../lib/presentation-format-model";
import { compoundStripes, dashArray, gradientVector, lineCap, shadowOffset, sortedStops } from "../lib/presentation-paint";
import { patternTilePath } from "../lib/powerpoint-patterns";

type Shape = Extract<PresentationElement, { type: "shape" }>;
type ShapeContent = Shape["content"];

/** DOM ids must be unique per element; the same element drawn twice (thumbnails) yields identical defs. */
export const paintId = (element: { id: string }, part: string) => `pp-${element.id.replace(/[^A-Za-z0-9_-]/g, "")}-${part}`;

/** A pattern tile is 8 device pixels at 96 dpi: 6 pt. */
const TILE = 6;

/** One paint server (gradient, pattern or picture) for `fill`, under the given id. */
export function PaintServer({ id, fill, w, h, mediaUrl }: { id: string; fill: PresentationFillStyle | { type: "solid"; color: string; transparency?: number } | { type: "none" }; w: number; h: number; mediaUrl?: (id: string) => string }) {
  if (fill.type === "gradient") {
    const stops = sortedStops(fill).map((stop, i) => <stop key={i} offset={stop.position} stopColor={stop.color} stopOpacity={1 - (stop.transparency ?? 0)} />);
    if (fill.kind === "linear") {
      const v = gradientVector(fill.angle, w, h);
      return <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={v.x1} y1={v.y1} x2={v.x2} y2={v.y2}>{stops}</linearGradient>;
    }
    // Radial, rectangular and path gradients all grow from the centre out to the corners.
    return <radialGradient id={id} gradientUnits="userSpaceOnUse" cx={w / 2} cy={h / 2} r={Math.hypot(w, h) / 2}>{stops}</radialGradient>;
  }
  if (fill.type === "pattern") {
    return <pattern id={id} patternUnits="userSpaceOnUse" width={TILE} height={TILE}>
      <rect width={TILE} height={TILE} fill={fill.background || "#FFFFFF"} />
      <path d={patternTilePath(fill.pattern)} transform={`scale(${TILE / 8})`} fill={fill.foreground || "#000000"} shapeRendering="crispEdges" />
    </pattern>;
  }
  if (fill.type === "picture" && mediaUrl) {
    const opacity = 1 - (fill.transparency ?? 0);
    return fill.tile
      ? <pattern id={id} patternUnits="userSpaceOnUse" width={96} height={96}><image href={mediaUrl(fill.attachmentId)} width={96} height={96} preserveAspectRatio="xMidYMid slice" opacity={opacity} /></pattern>
      : <pattern id={id} patternUnits="userSpaceOnUse" width={w} height={h}><image href={mediaUrl(fill.attachmentId)} width={w} height={h} preserveAspectRatio="none" opacity={opacity} /></pattern>;
  }
  return null;
}

/** What a closed path is filled with, and how opaque that fill is. */
export function shapeFill(element: Shape): { fill: string; fillOpacity?: number } {
  const c = element.content, style = c.fillStyle;
  if (style && (style.type !== "picture" || style.attachmentId)) return { fill: `url(#${paintId(element, "fill")})`, fillOpacity: c.fillTransparency ? 1 - c.fillTransparency : undefined };
  if (!c.fill) return { fill: "none" };
  return { fill: c.fill, fillOpacity: c.fillTransparency ? 1 - c.fillTransparency : undefined };
}

/** Stroke attributes for the outline: colour, transparency, width, dash, cap and join. */
export function strokeAttributes(c: ShapeContent): SVGProps<SVGPathElement> {
  if (!c.strokeWidth) return { stroke: "none" };
  return {
    stroke: c.stroke || "currentColor", strokeOpacity: c.lineTransparency ? 1 - c.lineTransparency : undefined, strokeWidth: c.strokeWidth,
    strokeDasharray: dashArray(c.dash, c.strokeWidth), strokeLinecap: lineCap(c.dash, c.cap),
    strokeLinejoin: c.join === "round" ? "round" : c.join === "bevel" ? "bevel" : "miter", strokeMiterlimit: 8,
  };
}

/** A compound (double/triple) line: the outline drawn once per stripe through a mask of the gaps. */
export function CompoundMask({ id, d, width, compound }: { id: string; d: string[]; width: number; compound?: string }) {
  const stripes = compoundStripes(compound);
  if (!stripes || !width) return null;
  // Every stripe boundary is a centred stroke: keep stripes, cut the gaps between them.
  const cuts: number[] = [];
  for (let i = 0; i < stripes.length - 1; i++) {
    const gapStart = stripes[i][0] + stripes[i][1], gapEnd = stripes[i + 1][0];
    cuts.push(Math.abs(1 - 2 * gapStart), Math.abs(1 - 2 * gapEnd));
  }
  // A centred stroke of width k·w covers the middle band; alternate black and white bands from the outside in.
  // Symmetric stripes give each boundary twice; widest first so narrower bands paint over wider ones.
  const unique = [...new Set(cuts.map((cut) => Math.round(cut * 1e6) / 1e6))].sort((a, b) => b - a);
  const bands = [1, ...unique].map((share, i) => ({ share, color: i % 2 === 0 ? "white" : "black" }));
  return <mask id={id} maskUnits="userSpaceOnUse" x="-50%" y="-50%" width="200%" height="200%">
    {bands.map((band, i) => d.map((path, j) => <path key={`${i}-${j}`} d={path} fill="none" stroke={band.color} strokeWidth={width * band.share} />))}
  </mask>;
}

/** The effects filter, or null when the shape has none that a filter draws. */
export function EffectsFilter({ id, effects }: { id: string; effects?: PresentationEffects }) {
  if (!effects) return null;
  const { shadow, glow, softEdges, bevel } = effects;
  if (!shadow && !glow && !softEdges && !bevel) return null;
  const outer = shadow && shadow.type !== "inner" ? shadow : undefined, inner = shadow?.type === "inner" ? shadow : undefined;
  // Bottom to top: shadow and glow behind the shape, the inner shadow over it.
  const merge = [outer && "shadow", glow && "glow", "body", inner && "inner"].filter((layer): layer is string => Boolean(layer));
  return <filter id={id} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
    {softEdges ? <>
      <feMorphology in="SourceAlpha" operator="erode" radius={softEdges / 2} result="softCore" />
      <feGaussianBlur in="softCore" stdDeviation={softEdges / 4} result="softMask" />
      <feComposite in="SourceGraphic" in2="softMask" operator="in" result="source" />
    </> : <feOffset in="SourceGraphic" result="source" />}
    {outer && (() => {
      const { dx, dy } = shadowOffset(outer.angle, outer.distance);
      return <>
        <feGaussianBlur in="SourceAlpha" stdDeviation={outer.blur / 2} result="shadowBlur" />
        <feOffset in="shadowBlur" dx={dx} dy={dy} result="shadowOffset" />
        <feFlood floodColor={outer.color} floodOpacity={1 - outer.transparency} />
        <feComposite in2="shadowOffset" operator="in" result="shadow" />
      </>;
    })()}
    {glow && (() => {
      return <>
        <feMorphology in="SourceAlpha" operator="dilate" radius={glow.size / 2} result="glowSpread" />
        <feGaussianBlur in="glowSpread" stdDeviation={glow.size / 2} result="glowBlur" />
        <feFlood floodColor={glow.color} floodOpacity={1 - glow.transparency} />
        <feComposite in2="glowBlur" operator="in" result="glow" />
      </>;
    })()}
    {bevel ? <>
      <feGaussianBlur in="SourceAlpha" stdDeviation={Math.max(bevel.width / 3, 0.5)} result="bevelHeight" />
      <feSpecularLighting in="bevelHeight" surfaceScale={Math.max(bevel.height / 2, 1)} specularConstant={0.8} specularExponent={18} lightingColor="#ffffff" result="bevelSpecular">
        <feDistantLight azimuth={225} elevation={40} />
      </feSpecularLighting>
      <feComposite in="bevelSpecular" in2="SourceAlpha" operator="in" result="bevelLight" />
      <feComposite in="source" in2="bevelLight" operator="arithmetic" k1={0} k2={1} k3={0.7} k4={0} result="body" />
    </> : <feOffset in="source" result="body" />}
    {inner && (() => {
      const { dx, dy } = shadowOffset(inner.angle, inner.distance);
      return <>
        <feOffset in="SourceAlpha" dx={dx} dy={dy} result="innerOffset" />
        <feGaussianBlur in="innerOffset" stdDeviation={inner.blur / 2} result="innerBlur" />
        <feComposite in="SourceAlpha" in2="innerBlur" operator="out" result="innerEdge" />
        <feFlood floodColor={inner.color} floodOpacity={1 - inner.transparency} />
        <feComposite in2="innerEdge" operator="in" result="innerColor" />
        <feComposite in="innerColor" in2="SourceAlpha" operator="in" result="inner" />
      </>;
    })()}
    <feMerge>{merge.map((name) => <feMergeNode key={name} in={name} />)}</feMerge>
  </filter>;
}
