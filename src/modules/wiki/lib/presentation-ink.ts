// Default text colour for text without one of its own. Slides are documents, not app chrome:
// text on a white slide must stay dark in the app's dark mode. So the colour comes from the
// surface the text sits on (its own fill, the object painted under its centre, or the
// presentation background), and only text on the bare canvas keeps the app theme's colour.
// Used by elementsToNodes in components/presentation-canvas.tsx.
import { parseColor } from "./svg-typography";
import { isLinearShape } from "./presentation-interactions";
import type { PresentationElement } from "./presentation-model";

export const PRESENTATION_DARK_INK = "#1f2937";
export const PRESENTATION_LIGHT_INK = "#f8fafc";

/** Dark ink on a light colour, light ink on a dark one; undefined for a colour we cannot read. */
export function inkOn(surface: string | null | undefined): string | undefined {
  const color = parseColor(surface);
  if (!color) return undefined;
  const channel = (value: number) => { const s = value / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  const luminance = 0.2126 * channel(color.red) + 0.7152 * channel(color.green) + 0.0722 * channel(color.blue);
  // The luminance where black and white text have the same contrast ratio.
  return luminance > 0.179 ? PRESENTATION_DARK_INK : PRESENTATION_LIGHT_INK;
}

/**
 * The solid colour an element paints over its box; "opaque" when it covers what is below
 * with something we cannot read (a photo, a gradient); null when it lets the surface show.
 */
function surfaceOf(element: PresentationElement): string | "opaque" | null {
  if (element.background) return element.background;
  if (element.type === "image" || element.type === "video") return "opaque";
  if (element.type !== "shape" || isLinearShape(element)) return null;
  const c = element.content;
  if (!c.fill && !c.fillStyle) return null;
  if (c.opacity < 0.5 || (c.fillTransparency ?? 0) > 0.5) return null;
  return c.fillStyle ? "opaque" : c.fill;
}

/** Elements drawn in the inherited text colour: text, shape text and outlines, charts, icons. */
function usesInk(element: PresentationElement) {
  if (element.type === "text") return !element.content.color;
  return (element.type === "shape" && !isLinearShape(element)) || element.type === "chart" || element.type === "icon";
}

/**
 * Default ink for every element drawn in the inherited colour, by id. Paint order matches
 * elementsToNodes: frames behind everything, then array order.
 */
export function presentationDefaultInks(elements: PresentationElement[], background?: string): Map<string, string> {
  const inks = new Map<string, string>();
  const painted = [...elements.filter(e => e.type === "frame"), ...elements.filter(e => e.type !== "frame")];
  const canvasInk = inkOn(background);
  painted.forEach((element, index) => {
    if (!usesInk(element)) return;
    // The first surface found decides: an unreadable one leaves the theme's colour.
    let surface = surfaceOf(element);
    const cx = element.x + element.width / 2, cy = element.y + element.height / 2;
    for (let below = index - 1; below >= 0 && surface === null; below--) {
      const under = painted[below];
      if (cx < under.x || cx > under.x + under.width || cy < under.y || cy > under.y + under.height) continue;
      surface = surfaceOf(under);
    }
    const ink = surface === null ? canvasInk : surface === "opaque" ? undefined : inkOn(surface);
    if (ink) inks.set(element.id, ink);
  });
  return inks;
}
