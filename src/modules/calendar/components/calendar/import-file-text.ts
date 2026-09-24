"use client";

// Extracts plain text from a dropped/selected import file (PDF via pdf.js, or text formats).
// Used by event-import-section.tsx.

export async function extractImportFileText(file: File) {
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("file_too_large");
  }
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
    const document = await pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
    }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 30); pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" "),
      );
      if (pages.join("\n").length >= 240_000) break;
    }
    return pages.join("\n").slice(0, 240_000);
  }
  const supported =
    file.type.startsWith("text/") ||
    /\.(?:ics|txt|md|csv|json)$/i.test(file.name);
  if (!supported) throw new Error("unsupported_file");
  return (await file.text()).slice(0, 240_000);
}
