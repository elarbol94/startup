import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { blankDocx } from "../office/blank-docx";
import { generateDocumentDocx } from "./document-docx";
import { DEFAULT_DOCUMENT_SETTINGS } from "./document-settings";
import { HOUSE_FONT, HOUSE_STYLES } from "./docx-styles";

function styleXml(bytes: Uint8Array, styleId: string) {
  const xml = strFromU8(unzipSync(bytes)["word/styles.xml"]);
  const start = xml.indexOf(`w:styleId="${styleId}"`);
  return start < 0 ? "" : xml.slice(start, xml.indexOf("</w:style>", start));
}

describe("house DOCX styles", () => {
  it("gives headings space above and below and keeps them with the next paragraph", async () => {
    for (const bytes of [
      await blankDocx("Titel", "de"),
      await generateDocumentDocx("Titel", { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Abschnitt" }] }] }, DEFAULT_DOCUMENT_SETTINGS),
    ]) {
      const heading = styleXml(bytes, "Heading1");
      expect(heading).toContain('w:before="480"');
      expect(heading).toContain('w:after="160"');
      expect(heading).toContain("<w:keepNext/>");
      expect(heading).toContain("<w:b/>");
      expect(styleXml(bytes, "Heading2")).toContain('w:before="360"');
      expect(styleXml(bytes, "Caption")).toContain('w:after="240"');
      const defaults = strFromU8(unzipSync(bytes)["word/styles.xml"]);
      expect(defaults).toMatch(/<w:pPrDefault><w:pPr><w:spacing [^>]*w:after="120"/);
      expect(defaults).toContain(`w:ascii="${HOUSE_FONT}"`);
    }
  });

  it("matches the copy the workspace plugin applies to open documents", () => {
    const plugin = readFileSync(join(process.cwd(), "public/onlyoffice-plugins/management/plugin.js"), "utf8");
    const styles = plugin.match(/var HOUSE_STYLES = (\[[\s\S]*?\]);/);
    expect(styles).not.toBeNull();
    expect(JSON.parse(styles![1])).toEqual(HOUSE_STYLES);
    expect(plugin).toContain(`var HOUSE_FONT = "${HOUSE_FONT}";`);
  });
});
