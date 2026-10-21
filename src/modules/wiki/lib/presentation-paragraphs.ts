// Paragraph formatting of presentation text: the PowerPoint bullet and numbering galleries,
// automatic numbering across list levels, indents and line spacing. `paragraphs[i]` formats the
// i-th "\n"-separated line; text saved before paragraphs existed uses the old `list` setting.
import type { PresentationNumberScheme, PresentationParagraph } from "./presentation-format-model";

type Bullet = NonNullable<PresentationParagraph["bullet"]>;

/** Home → Bullets gallery, in order (read from PowerPoint's ribbon). */
export const BULLET_GALLERY: { id: string; bullet: Bullet }[] = [
  { id: "none", bullet: { kind: "none" } },
  { id: "filledRound", bullet: { kind: "char", char: "•", font: "Arial" } },
  { id: "hollowRound", bullet: { kind: "char", char: "o", font: "Courier New" } },
  { id: "filledSquare", bullet: { kind: "char", char: "▪" } },
  { id: "hollowSquare", bullet: { kind: "char", char: "❑" } },
  { id: "star", bullet: { kind: "char", char: "❖" } },
  { id: "arrow", bullet: { kind: "char", char: "➢" } },
  { id: "checkmark", bullet: { kind: "char", char: "✓" } },
];
/** Home → Numbering gallery, in order. */
export const NUMBERING_GALLERY: { id: string; label: string; bullet: Bullet }[] = [
  { id: "none", label: "", bullet: { kind: "none" } },
  ...(["arabicPeriod", "arabicParenR", "romanUcPeriod", "alphaUcPeriod", "alphaLcParenR", "alphaLcPeriod", "romanLcPeriod"] as const)
    .map((scheme) => ({ id: scheme, label: [1, 2, 3].map((n) => formatNumber(scheme, n)).join(" "), bullet: { kind: "number" as const, scheme } })),
];

function roman(n: number): string {
  const table: [number, string][] = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
  let out = "";
  for (const [value, letters] of table) while (n >= value) { out += letters; n -= value; }
  return out;
}
function alpha(n: number): string {
  // PowerPoint repeats the letter past Z: AA, BB, … (not spreadsheet columns).
  const letter = String.fromCharCode(65 + ((n - 1) % 26));
  return letter.repeat(Math.floor((n - 1) / 26) + 1);
}
/** The label of item `n` in a numbering scheme: "3.", "c)", "iv.". */
export function formatNumber(scheme: PresentationNumberScheme, n: number): string {
  switch (scheme) {
    case "arabicPeriod": return `${n}.`;
    case "arabicParenR": return `${n})`;
    case "romanUcPeriod": return `${roman(n)}.`;
    case "romanLcPeriod": return `${roman(n).toLowerCase()}.`;
    case "alphaUcPeriod": return `${alpha(n)}.`;
    case "alphaLcParenR": return `${alpha(n).toLowerCase()})`;
    case "alphaLcPeriod": return `${alpha(n).toLowerCase()}.`;
  }
}

/** Each line's effective paragraph format, with the old whole-box `list` folded in. */
export function effectiveParagraphs(lineCount: number, paragraphs: PresentationParagraph[] | undefined, list: "none" | "bullet" | "number" | undefined): PresentationParagraph[] {
  const legacy: Bullet | undefined = list === "bullet" ? { kind: "char", char: "•" } : list === "number" ? { kind: "number", scheme: "arabicPeriod" } : undefined;
  return Array.from({ length: lineCount }, (_, i) => {
    const own = paragraphs?.[i] ?? {};
    return own.bullet || !legacy ? own : { ...own, bullet: legacy };
  });
}

/**
 * The bullet or number shown before each paragraph. Numbering continues while paragraphs of
 * the same level keep the same scheme; a deeper level does not interrupt the outer count, and
 * a paragraph at a shallower level or without numbering restarts the deeper ones.
 */
export function paragraphMarkers(paragraphs: PresentationParagraph[]): ({ text: string; font?: string } | null)[] {
  const counters: ({ scheme: PresentationNumberScheme; n: number } | undefined)[] = [];
  return paragraphs.map((p) => {
    const level = p.level ?? 0, bullet = p.bullet;
    counters.length = Math.min(counters.length, level + 1);
    if (!bullet || bullet.kind === "none") { counters[level] = undefined; return null; }
    if (bullet.kind === "char") { counters[level] = undefined; return { text: bullet.char, font: bullet.font }; }
    const current = counters[level];
    const n = current && current.scheme === bullet.scheme ? current.n + 1 : bullet.start ?? 1;
    counters[level] = { scheme: bullet.scheme, n };
    return { text: formatNumber(bullet.scheme, n) };
  });
}

/** One list level indents by half an inch (36 pt); a bullet hangs in a further 18 pt (PowerPoint's text box defaults). */
export const LEVEL_INDENT = 36;
export const BULLET_HANG = 18;

/** Left margin and first-line indent in pt, from explicit values or the level/bullet defaults. */
export function paragraphIndent(p: PresentationParagraph): { marginLeft: number; textIndent: number } {
  const bulleted = Boolean(p.bullet && p.bullet.kind !== "none");
  const marginLeft = p.indent ?? (p.level ?? 0) * LEVEL_INDENT + (bulleted ? BULLET_HANG : 0);
  const special = p.special ?? (bulleted && p.indent === undefined ? "hanging" : "none");
  const by = p.by ?? (special === "none" ? 0 : BULLET_HANG);
  return { marginLeft, textIndent: special === "hanging" ? -by : special === "firstLine" ? by : 0 };
}

/** CSS line height for a paragraph: multiples of the base, or an exact height in pt. */
export function paragraphLineHeight(p: PresentationParagraph, base = 1.15): number | string {
  if (!p.lineSpacing) return base;
  return p.lineSpacing.rule === "exactly" ? `${p.lineSpacing.value}px` : base * p.lineSpacing.value;
}

/** Sets a field on the given lines' paragraphs, filling in the array as far as needed. */
export function updateParagraphs(paragraphs: PresentationParagraph[] | undefined, lineCount: number, lines: Iterable<number>, update: (p: PresentationParagraph) => PresentationParagraph): PresentationParagraph[] {
  const next = Array.from({ length: lineCount }, (_, i) => paragraphs?.[i] ?? {});
  for (const i of lines) if (i >= 0 && i < lineCount) next[i] = clean(update(next[i]));
  return next;
}
function clean(p: PresentationParagraph): PresentationParagraph {
  return Object.fromEntries(Object.entries(p).filter(([, value]) => value !== undefined)) as PresentationParagraph;
}

/** Tab / Shift+Tab: demote or promote list paragraphs, within PowerPoint's nine levels. */
export function shiftLevel(p: PresentationParagraph, delta: number): PresentationParagraph {
  const level = Math.max(0, Math.min(8, (p.level ?? 0) + delta));
  return { ...p, level: level || undefined, indent: undefined };
}

/** The number of "\n"-separated lines in a text. */
export const lineCount = (text: string) => text.split("\n").length;
