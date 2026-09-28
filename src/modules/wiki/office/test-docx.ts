import { strToU8, zipSync } from "fflate";

/** Minimal DOCX builder for tests: body XML plus optional extra parts. */
export const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

export function testDocx(body: string, parts: Record<string, string> = {}) {
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    "word/document.xml": strToU8(`<?xml version="1.0"?><w:document ${W_NS}><w:body>${body}</w:body></w:document>`),
    ...Object.fromEntries(Object.entries(parts).map(([name, xml]) => [name, strToU8(xml)])),
  }));
}

export const para = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

export function control(tag: string, text: string) {
  const escaped = tag.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<w:sdt><w:sdtPr><w:tag w:val="${escaped}"/></w:sdtPr><w:sdtContent><w:r><w:t>${text}</w:t></w:r></w:sdtContent></w:sdt>`;
}
