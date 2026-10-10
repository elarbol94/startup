import { Document, HeadingLevel, Packer, Paragraph } from "docx";
import { houseDocxStyles } from "../lib/docx-styles";

const A4 = { page: { size: { width: 11906, height: 16838 }, margin: { top: 1417, bottom: 1134, left: 1417, right: 1417 } } };

/** A4 document with the page title as its first heading. */
export async function blankDocx(title: string, locale: "de" | "en") {
  return pack(title, locale, [new Paragraph({ heading: HeadingLevel.HEADING_1, text: title }), new Paragraph({ text: "" })]);
}

/** Empty A4 document with the house styles: the section editor's scratch document. */
export async function scratchDocx(locale: "de" | "en") {
  return pack(locale === "de" ? "Abschnitt" : "Section", locale, [new Paragraph({ text: "" })]);
}

async function pack(title: string, locale: "de" | "en", children: Paragraph[]) {
  const document = new Document({
    creator: "Management Platform",
    title,
    styles: houseDocxStyles(locale === "de" ? "de-AT" : "en-US"),
    sections: [{ properties: A4, children }],
  });
  return Buffer.from(await Packer.toBuffer(document));
}
