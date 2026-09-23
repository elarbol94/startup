import { DOMParser, type Element } from "@xmldom/xmldom";

const FORBIDDEN_SVG_MARKUP = [
  /<!doctype/i,
  /<!entity/i,
  // Allows an optional namespace prefix (e.g. <a:script>) so a colon between "<" and the tag
  // name cannot slip a blocked element past this check.
  /<\s*(?:[\w-]+:)?(?:script|foreignObject|iframe|object|embed|audio|video|canvas|style|link|meta|base|animate|animatetransform|animatemotion|set)\b/i,
  /\bon[a-z]+\s*=/i,
  /\b(?:href|xlink:href)\s*=\s*["']\s*(?!#|data:image\/(?:png|jpeg|gif|webp);base64,)/i,
  /\b(?:src|data)\s*=\s*["']\s*(?:https?:|\/\/|\/)/i,
  /\burl\s*\(\s*["']?\s*(?!#)/i,
  /@import\b/i,
  /\bexpression\s*\(/i,
];

const SVG_NS = "http://www.w3.org/2000/svg";
const HTML_NAMESPACES = new Set(["http://www.w3.org/1999/xhtml", "http://www.w3.org/1998/Math/MathML"]);
// Inert SVG elements. Active ones (script, style, foreignObject, animation) are
// rejected by the patterns above anyway.
const SVG_ELEMENTS = new Set([
  "a", "circle", "clipPath", "defs", "desc", "ellipse", "feBlend", "feColorMatrix", "feComponentTransfer",
  "feComposite", "feConvolveMatrix", "feDiffuseLighting", "feDisplacementMap", "feDistantLight", "feDropShadow",
  "feFlood", "feFuncA", "feFuncB", "feFuncG", "feFuncR", "feGaussianBlur", "feImage", "feMerge", "feMergeNode",
  "feMorphology", "feOffset", "fePointLight", "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence",
  "filter", "g", "image", "line", "linearGradient", "marker", "mask", "metadata", "path", "pattern", "polygon",
  "polyline", "radialGradient", "rect", "stop", "svg", "switch", "symbol", "text", "textPath", "title", "tspan",
  "use", "view",
]);
// Checked on parsed, entity-decoded values, so character references and CSS
// escapes cannot hide a URL or a scheme from the source-level patterns above.
const FORBIDDEN_ATTRIBUTE_VALUE = /\\|url\s*\(\s*["']?\s*(?!#)|image-set\s*\(|@import|expression\s*\(|javascript:/i;

/**
 * Structural allowlist on top of the pattern denylist. SVG is inlined into
 * HTML, where an unprefixed HTML tag name (e.g. <div><form action=...>) breaks
 * out of foreign content and becomes live HTML whatever its XML namespace.
 * Unprefixed elements must therefore be known SVG elements; prefixed editor
 * metadata (inkscape:, sodipodi:, rdf:) stays inert and is allowed.
 */
function hasOnlySafeSvgStructure(source: string) {
  let malformed = false;
  const document = new DOMParser({ onError: (level) => { if (level !== "warning") malformed = true; } })
    .parseFromString(source, "image/svg+xml");
  const root = document.documentElement;
  if (malformed || !root || root.localName !== "svg" || root.namespaceURI !== SVG_NS) return false;
  const pending: Element[] = [root];
  while (pending.length) {
    const element = pending.pop()!;
    if (element.prefix ? HTML_NAMESPACES.has(element.namespaceURI ?? "") : element.namespaceURI !== SVG_NS || !SVG_ELEMENTS.has(element.localName ?? "")) return false;
    for (let index = 0; index < element.attributes.length; index += 1) {
      const attribute = element.attributes[index];
      const name = (attribute.localName ?? attribute.name).toLowerCase();
      if (name.startsWith("on")) return false;
      if (name === "href" && !/^\s*(?:#|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(attribute.value)) return false;
      // Prefixed editor attributes (e.g. inkscape:export-filename="C:\\...") are never read as CSS.
      if (!attribute.prefix && FORBIDDEN_ATTRIBUTE_VALUE.test(attribute.value)) return false;
    }
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 1) pending.push(child as Element);
    }
  }
  return true;
}

export function isSafeInlineSvg(bytes: Uint8Array) {
  try {
    const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
    if (!source || source.length > 5_000_000) return false;
    if (!/<svg(?:\s|>)/i.test(source) || !/<\/svg\s*>$/i.test(source)) return false;
    return FORBIDDEN_SVG_MARKUP.every((pattern) => !pattern.test(source)) && hasOnlySafeSvgStructure(source);
  } catch {
    return false;
  }
}
