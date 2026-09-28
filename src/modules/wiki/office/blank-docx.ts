import { Document, HeadingLevel, Packer, Paragraph } from "docx";

/** A4 document with the page title as its first heading. */
export async function blankDocx(title: string, locale: "de" | "en") {
  const document = new Document({
    creator: "Management Platform",
    title,
    styles: { default: { document: { run: { font: "Calibri", size: 22, language: { value: locale === "de" ? "de-AT" : "en-US" } } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1417, bottom: 1134, left: 1417, right: 1417 } } },
      children: [new Paragraph({ heading: HeadingLevel.HEADING_1, text: title }), new Paragraph({ text: "" })],
    }],
  });
  return Buffer.from(await Packer.toBuffer(document));
}
