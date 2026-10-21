// Reads the small, generated HTML that pptxtojson emits for text bodies (`<ul>/<ol>`,
// `<li>`, `<p style>`, `<span style>`, `<a href>`) into paragraphs of styled runs.
// It is not a general HTML parser: text is kept as text and never rendered as markup.

export type PptxHtmlRun = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; color?: string; href?: string; sizePt?: number; family?: string;
  strike?: boolean; script?: "super" | "sub"; letterSpacingPt?: number };
/** `lineHeight` is a factor of single spacing (a number) or exact points. */
export type PptxHtmlParagraph = { align: "left" | "center" | "right"; justify?: boolean; list: "bullet" | "number" | null; listDepth: number; marginLeft: number; textIndent: number;
  lineHeight?: { factor: number } | { points: number }; spaceBeforePt?: number; spaceAfterPt?: number; runs: PptxHtmlRun[] };

const named: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
export function decodePptxEntities(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] !== "#") return named[entity.toLowerCase()] ?? match;
    const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

const styleOf = (attributes: string) => {
  const style = /style="([^"]*)"/i.exec(attributes)?.[1] ?? "";
  return Object.fromEntries(style.split(";").map((part) => part.split(":")).filter((pair) => pair.length >= 2).map(([key, ...value]) => [key.trim().toLowerCase(), value.join(":").trim()]));
};
const points = (value?: string) => { const match = /^(-?[\d.]+)pt$/.exec(value ?? ""); return match ? Number(match[1]) : 0; };
const lineHeight = (value?: string): PptxHtmlParagraph["lineHeight"] => {
  if (!value) return undefined;
  if (/pt$/.test(value)) return points(value) > 0 ? { points: points(value) } : undefined;
  const factor = Number(value);
  return Number.isFinite(factor) && factor > 0 ? { factor } : undefined;
};
export const pptxColor = (value?: string) => (value && /^#([\da-f]{6}|[\da-f]{8})$/i.test(value) ? value.slice(0, 7).toLowerCase() : undefined);

export function parsePptxHtml(html: string): PptxHtmlParagraph[] {
  const paragraphs: PptxHtmlParagraph[] = [];
  const lists: Array<"bullet" | "number"> = [];
  const spans: PptxHtmlRun[] = [];
  let paragraph: PptxHtmlParagraph | null = null, href: string | undefined;
  for (const [, closing, tag, attributes, text] of html.matchAll(/<(\/?)([a-z]+)([^>]*)>|([^<]+)/gi)) {
    if (text !== undefined) {
      if (!paragraph) continue;
      const style = spans.at(-1) ?? {};
      paragraph.runs.push({ ...style, text: decodePptxEntities(text), ...(href ? { href } : {}) });
      continue;
    }
    const name = tag.toLowerCase();
    if (name === "ul" || name === "ol") { if (closing) lists.pop(); else lists.push(name === "ul" ? "bullet" : "number"); }
    else if (name === "p") {
      if (closing) { paragraph = null; continue; }
      const style = styleOf(attributes);
      const align = style["text-align"];
      paragraph = { align: align === "center" ? "center" : align === "right" ? "right" : "left", ...(align === "justify" ? { justify: true } : {}), list: lists.at(-1) ?? null, listDepth: Math.max(0, lists.length - 1), marginLeft: points(style["margin-left"]), textIndent: points(style["text-indent"]),
        lineHeight: lineHeight(style["line-height"]), spaceBeforePt: points(style["margin-top"]) || undefined, spaceAfterPt: points(style["margin-bottom"]) || undefined, runs: [] };
      paragraphs.push(paragraph);
    } else if (name === "span") {
      if (closing) { spans.pop(); continue; }
      const style = styleOf(attributes);
      spans.push({ text: "", bold: /^(bold|[6-9]00)$/.test(style["font-weight"] ?? "") || undefined, italic: style["font-style"] === "italic" || undefined,
        underline: /underline/.test(`${style["text-decoration"] ?? ""} ${style["text-decoration-line"] ?? ""}`) || undefined, color: pptxColor(style.color),
        sizePt: points(style["font-size"]) || undefined, family: style["font-family"]?.replace(/["']/g, "") || undefined,
        strike: /line-through/.test(style["text-decoration-line"] ?? "") || undefined, script: style["vertical-align"] === "super" ? "super" : style["vertical-align"] === "sub" ? "sub" : undefined,
        letterSpacingPt: points(style["letter-spacing"]) || undefined });
    } else if (name === "a") href = closing ? undefined : decodePptxEntities(/href="([^"]*)"/i.exec(attributes)?.[1] ?? "") || undefined;
  }
  return paragraphs;
}

/** Plain text for speaker notes and table cells: one line per paragraph. */
export function pptxHtmlToText(html: string) {
  return parsePptxHtml(html).map((paragraph) => paragraph.runs.map((run) => run.text).join("").replace(/\s+$/, "")).join("\n").replace(/^\n+|\n+$/g, "");
}
