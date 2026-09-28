import { unzipSync } from "fflate";

export class DocxLimitError extends Error {}

/** Limits for untrusted DOCX (uploads and document-server callbacks). */
export const DOCX_LIMITS = {
  entries: 4000,
  entryBytes: 25 * 1024 * 1024,
  totalBytes: 80 * 1024 * 1024,
  /** Expanded size may exceed 200× the compressed size only for small entries. */
  ratio: 200,
  xmlPartBytes: 20 * 1024 * 1024,
};

/**
 * Unpacks a DOCX under explicit decompression limits (fflate checks the
 * declared sizes before inflating) and verifies the OOXML parts every Word
 * document needs. Throws DocxLimitError for anything else.
 */
export function unzipDocxBounded(bytes: Uint8Array, { requireParts = true } = {}): Record<string, Uint8Array> {
  let total = 0, count = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (file) => {
      total += file.originalSize;
      if (++count > DOCX_LIMITS.entries || file.originalSize > DOCX_LIMITS.entryBytes || total > DOCX_LIMITS.totalBytes
        || file.originalSize > Math.max(1024 * 1024, file.size * DOCX_LIMITS.ratio)) throw new DocxLimitError("DOCX decompression limit");
      return true;
    } });
  } catch (error) {
    if (error instanceof DocxLimitError) throw error;
    throw new DocxLimitError("Not a valid DOCX archive");
  }
  // The declared sizes are what the filter saw; confirm the inflated output agrees.
  let actual = 0;
  for (const [name, data] of Object.entries(files)) {
    actual += data.byteLength;
    if (data.byteLength > DOCX_LIMITS.entryBytes || (name.endsWith(".xml") && data.byteLength > DOCX_LIMITS.xmlPartBytes)) throw new DocxLimitError("DOCX part too large");
  }
  if (actual > DOCX_LIMITS.totalBytes) throw new DocxLimitError("DOCX decompression limit");
  if (requireParts && (!files["[Content_Types].xml"] || !files["word/document.xml"])) throw new DocxLimitError("DOCX is missing required parts");
  return files;
}
