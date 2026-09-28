import type { OfficeConfig } from "./config";
import { downloadFromDocServer, OfficeHttpError, postToDocServer } from "./office-http";
import { signFileToken } from "./tokens";

type ConvertResult = { endConvert?: boolean; fileUrl?: string; error?: number };

/** Converts a stored DOCX version to PDF through ConvertService (synchronous mode). */
export async function convertVersionToPdf(config: OfficeConfig, page: { id: string; title: string }, version: { id: string; attachmentId: string }) {
  const token = signFileToken({ res: "docx", pageId: page.id, versionId: version.id, attachmentId: version.attachmentId }, 600);
  const result = await postToDocServer<ConvertResult>("/converter", {
    async: false,
    filetype: "docx",
    outputtype: "pdf",
    // Versions are immutable, so the conversion cache can be reused per version.
    key: `pdf-${version.id}`,
    title: `${page.title}.docx`,
    url: `${config.appInternalUrl}/api/wiki/office/file?token=${encodeURIComponent(token)}`,
  }, config);
  if (result.error || !result.endConvert || !result.fileUrl) throw new OfficeHttpError(`conversion failed: ${result.error ?? "incomplete"}`);
  return downloadFromDocServer(result.fileUrl, config);
}
