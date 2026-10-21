import { toast } from "sonner";

type Messages = { saveFailed: string; failed: string; placeholders: string };

/** The server-side Content-Disposition name, preferring the UTF-8 form. */
export function pptxDownloadName(header: string | null) {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header ?? "")?.[1];
  if (encoded) try { return decodeURIComponent(encoded); } catch { /* fall through to the ASCII name */ }
  return /filename="([^"]+)"/i.exec(header ?? "")?.[1] ?? "presentation.pptx";
}

/**
 * The export reads the saved canvas, so a pending edit is written first. The file arrives
 * through fetch (not a navigation) so failures and placeholder notes can be shown here.
 */
export async function downloadPresentationPptx(id: string, flush: () => Promise<boolean>, messages: Messages) {
  try {
    if (!await flush()) { toast.error(messages.saveFailed); return; }
    const response = await fetch(`/api/wiki/presentations/${encodeURIComponent(id)}/pptx`);
    if (!response.ok) throw new Error("Export failed");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url; link.download = pptxDownloadName(response.headers.get("Content-Disposition"));
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (response.headers.get("X-Export-Warnings")) toast.info(messages.placeholders);
  } catch { toast.error(messages.failed); }
}
