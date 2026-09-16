import { expect, test } from "vitest";
import { classifyPdfOpenError, PdfProcessingUnavailableError } from "./pdf-open-error";
import { PdfUploadStreamError } from "./pdf-upload-stream";

test.each(["PasswordException", "InvalidPDFException"])("reports %s as a file error", (name) => {
  const cause = Object.assign(new Error("Unreadable PDF"), { name });
  const result = classifyPdfOpenError(cause);
  expect(result).toBeInstanceOf(PdfUploadStreamError);
  expect(result.cause).toBe(cause);
});

test.each([new ReferenceError("DOMMatrix is not defined"), new Error("Cannot find module"), "unknown failure"])("preserves runtime failures for server diagnostics", (cause) => {
  const result = classifyPdfOpenError(cause);
  expect(result).toBeInstanceOf(PdfProcessingUnavailableError);
  expect(result).not.toBeInstanceOf(PdfUploadStreamError);
  expect(result.cause).toBe(cause);
});
