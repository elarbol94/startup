import type { IBaseParagraphStyleOptions, IStylesOptions } from "docx";

/**
 * House paragraph styles for Word documents: body text with paragraph spacing
 * and headings with space above, a little below, and kept with their next
 * paragraph. Sizes are half-points, spacing twips (20 = 1 pt).
 *
 * The workspace plugin applies the same values to documents that are already
 * open ("Format document"): keep `HOUSE_STYLES` in
 * public/onlyoffice-plugins/management/plugin.js identical (a test checks it).
 */
export type HouseStyle = {
  /** Style name as the editor shows it (ONLYOFFICE looks styles up by name). */
  name: string;
  size: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  before: number;
  after: number;
  /** Line spacing in 240ths of a line ("auto" rule). */
  line?: number;
  keepNext?: boolean;
  keepLines?: boolean;
};

export const HOUSE_FONT = "Calibri";

export const HOUSE_STYLES: HouseStyle[] = [
  { name: "Normal", size: 22, before: 0, after: 120, line: 276 },
  { name: "Title", size: 52, color: "1F3864", before: 0, after: 360, line: 240, keepNext: true },
  { name: "Heading 1", size: 32, bold: true, color: "1F3864", before: 480, after: 160, line: 240, keepNext: true, keepLines: true },
  { name: "Heading 2", size: 26, bold: true, color: "2E74B5", before: 360, after: 120, line: 240, keepNext: true, keepLines: true },
  { name: "Heading 3", size: 24, bold: true, color: "1F4D78", before: 240, after: 80, line: 240, keepNext: true, keepLines: true },
  { name: "Heading 4", size: 22, bold: true, italic: true, color: "2E74B5", before: 200, after: 60, line: 240, keepNext: true, keepLines: true },
  { name: "Caption", size: 18, italic: true, color: "595959", before: 60, after: 240 },
];

function style(name: string) {
  const spec = HOUSE_STYLES.find((item) => item.name === name)!;
  return {
    run: { size: spec.size, bold: spec.bold, italics: spec.italic, color: spec.color },
    paragraph: {
      spacing: { before: spec.before, after: spec.after, ...(spec.line ? { line: spec.line } : {}) },
      keepNext: spec.keepNext, keepLines: spec.keepLines,
    },
  } satisfies IBaseParagraphStyleOptions;
}

/** `styles` for a docx `Document`; `language` is the default proofing language (e.g. "de-AT"). */
export function houseDocxStyles(language?: string): IStylesOptions {
  const normal = style("Normal");
  return {
    default: {
      document: {
        run: { font: HOUSE_FONT, size: normal.run!.size, ...(language ? { language: { value: language } } : {}) },
        paragraph: normal.paragraph,
      },
      title: style("Title"),
      heading1: style("Heading 1"),
      heading2: style("Heading 2"),
      heading3: style("Heading 3"),
      heading4: style("Heading 4"),
    },
    paragraphStyles: [{ id: "Caption", name: "Caption", basedOn: "Normal", next: "Normal", quickFormat: true, ...style("Caption") }],
  };
}
