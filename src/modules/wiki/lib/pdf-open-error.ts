import { PdfUploadStreamError } from "./pdf-upload-stream";

export class PdfProcessingUnavailableError extends Error {}

export function classifyPdfOpenError(error: unknown): Error {
  const name = error instanceof Error ? error.name : "";
  if (name === "PasswordException" || name === "InvalidPDFException") {
    return new PdfUploadStreamError("The PDF is password-protected or structurally invalid", { cause: error });
  }
  return new PdfProcessingUnavailableError("PDF processing unavailable", { cause: error });
}
