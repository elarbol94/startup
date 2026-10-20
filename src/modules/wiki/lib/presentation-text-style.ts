// CSS for presentation text, shared by the rendered text and the on-canvas editor so entering
// and leaving edit mode never moves a line: paragraph spacing and indents, character formatting,
// text box layout and WordArt (text fill, outline and effects). Pure: no React or DOM.
import type { CSSProperties } from "react";
import type { PresentationParagraph, PresentationTextBody, PresentationTextStyle } from "./presentation-format-model";
import { shadowOffset } from "./presentation-paint";
import { paragraphIndent, paragraphLineHeight } from "./presentation-paragraphs";
import { patternTilePath } from "./powerpoint-patterns";

type Run = { strike?: "single" | "double"; underline?: boolean; baseline?: number; highlight?: string; spacing?: number; size?: number; caps?: "all" | "small" };

/** One paragraph's box: indents, spacing, line height and alignment. */
export function paragraphCss(p: PresentationParagraph, scale = 1): CSSProperties {
  const { marginLeft, textIndent } = paragraphIndent(p);
  return {
    marginLeft: marginLeft * scale || undefined, textIndent: textIndent * scale || undefined,
    marginTop: p.spaceBefore ? p.spaceBefore * scale : undefined, marginBottom: p.spaceAfter ? p.spaceAfter * scale : undefined,
    lineHeight: paragraphLineHeight(p), textAlign: p.align === "distributed" ? "justify" : p.align,
    textAlignLast: p.align === "distributed" ? "justify" : undefined,
  };
}

/** As an inline style attribute, for the editor's paragraph nodes. */
export function cssText(style: CSSProperties): string {
  return Object.entries(style).filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${typeof value === "number" && !/lineHeight/.test(key) ? `${value}px` : value}`).join(";");
}

/** A run's character formatting beyond weight, slant and colour. */
export function runCss(run: Run, scale = 1): CSSProperties {
  const lines = [run.underline && "underline", run.strike && "line-through"].filter(Boolean).join(" ");
  return {
    textDecorationLine: lines || undefined, textDecorationStyle: run.strike === "double" ? "double" : undefined,
    // PowerPoint shrinks super/subscript to two thirds and raises it by the offset.
    verticalAlign: run.baseline ? `${run.baseline / 100 / 0.67}em` : undefined, fontSize: run.baseline ? "0.67em" : run.size ? run.size * scale : undefined,
    backgroundColor: run.highlight || undefined, letterSpacing: run.spacing ? run.spacing * scale : undefined,
    textTransform: run.caps === "all" ? "uppercase" : undefined, fontVariant: run.caps === "small" ? "small-caps" : undefined,
  };
}

/** The outer box of a text body: where the text sits (anchor), its insets, direction and columns. */
export function textBoxCss(body: PresentationTextBody | undefined, defaults: { anchor: "top" | "middle" | "bottom"; insets: { left: number; top: number; right: number; bottom: number } }): { outer: CSSProperties; inner: CSSProperties } {
  const anchor = body?.anchor ?? defaults.anchor, insets = body?.insets ?? defaults.insets;
  const direction = body?.direction ?? "horizontal";
  const vertical = direction !== "horizontal";
  return {
    outer: {
      display: "flex", flexDirection: vertical ? "row" : "column", boxSizing: "border-box", height: "100%",
      justifyContent: anchor === "top" ? "flex-start" : anchor === "bottom" ? "flex-end" : "center",
      alignItems: body?.anchorCenter ? "center" : "stretch",
      padding: `${insets.top}px ${insets.right}px ${insets.bottom}px ${insets.left}px`,
      writingMode: vertical ? "vertical-rl" : undefined,
      // "Rotate all text 270°" reads bottom to top: the vertical box turned half way round.
      transform: direction === "vertical270" ? "rotate(180deg)" : undefined,
      overflow: "hidden",
    },
    inner: {
      textOrientation: direction === "stacked" ? "upright" : undefined,
      whiteSpace: body?.wrap === false ? "pre" : "pre-wrap",
      columnCount: body?.columns && body.columns > 1 ? body.columns : undefined, columnGap: body?.columns && body.columns > 1 ? body.columnSpacing ?? 0 : undefined,
      width: body?.anchorCenter && !vertical ? "max-content" : undefined, maxWidth: "100%",
    },
  };
}

const rgba = (hex: string, transparency = 0) => {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.round((1 - transparency) * 1000) / 1000})`;
};

/** WordArt: fills through background-clip, an outline stroke, and shadows, glow and bevel as text shadows. */
export function wordArtCss(style: PresentationTextStyle | undefined): CSSProperties {
  if (!style) return {};
  const css: CSSProperties = {};
  const fill = style.fill;
  if (fill?.type === "none") css.color = "transparent";
  else if (fill?.type === "solid") css.color = rgba(fill.color, fill.transparency);
  else if (fill?.type === "gradient") {
    const stops = [...fill.stops].sort((a, b) => a.position - b.position).map((s) => `${rgba(s.color, s.transparency)} ${Math.round(s.position * 100)}%`).join(", ");
    // CSS angles start at "to top"; PowerPoint's start at "to right".
    css.backgroundImage = fill.kind === "linear" ? `linear-gradient(${fill.angle + 90}deg, ${stops})` : `radial-gradient(circle, ${stops})`;
    Object.assign(css, { backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" });
  } else if (fill?.type === "pattern") {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="6" height="6" viewBox="0 0 8 8" shape-rendering="crispEdges"><rect width="8" height="8" fill="${fill.background}"/><path d="${patternTilePath(fill.pattern)}" fill="${fill.foreground}"/></svg>`;
    css.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
    Object.assign(css, { backgroundClip: "text", WebkitBackgroundClip: "text", color: "transparent" });
  }
  if (style.outline && style.outline.width > 0) {
    Object.assign(css, { WebkitTextStroke: `${style.outline.width}px ${rgba(style.outline.color, style.outline.transparency)}`, paintOrder: "stroke fill" });
  }
  const shadows: string[] = [];
  const effects = style.effects;
  if (effects?.shadow) {
    const { dx, dy } = shadowOffset(effects.shadow.angle, effects.shadow.distance);
    // An inner shadow cannot be drawn inside glyphs with CSS; a faint inset-looking offset stands in.
    shadows.push(effects.shadow.type === "inner" ? `${-dx / 2}px ${-dy / 2}px ${effects.shadow.blur / 2}px ${rgba(effects.shadow.color, Math.max(effects.shadow.transparency, 0.6))}` : `${dx}px ${dy}px ${effects.shadow.blur}px ${rgba(effects.shadow.color, effects.shadow.transparency)}`);
  }
  if (effects?.glow) shadows.push(`0 0 ${effects.glow.size}px ${rgba(effects.glow.color, effects.glow.transparency)}`, `0 0 ${effects.glow.size / 2}px ${rgba(effects.glow.color, effects.glow.transparency)}`);
  if (effects?.bevel) shadows.push(`-0.5px -0.5px 0 rgba(255,255,255,0.6)`, `0.75px 0.75px 0.5px rgba(0,0,0,0.35)`);
  if (shadows.length) css.textShadow = shadows.join(", ");
  if (effects?.reflection) {
    const r = effects.reflection;
    (css as Record<string, unknown>).WebkitBoxReflect = `below ${r.distance}px linear-gradient(transparent ${100 - r.size}%, rgba(255,255,255,${1 - r.transparency}))`;
  }
  return css;
}

/** A gradient's CSS for small previews (galleries and swatches). */
export function gradientPreview(stops: { color: string; position: number }[], angle: number): string {
  return `linear-gradient(${angle + 90}deg, ${[...stops].sort((a, b) => a.position - b.position).map((s) => `${s.color} ${Math.round(s.position * 100)}%`).join(", ")})`;
}
