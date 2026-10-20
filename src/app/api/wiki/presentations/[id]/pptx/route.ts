import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getPresentation } from "@/modules/wiki/presentation-queries";
import { pptxExportMedia } from "@/modules/wiki/presentation-pptx-export-media";
import { exportPresentationPptx, pptxFileName, PPTX_MIME } from "@/modules/wiki/lib/presentation-pptx-export";

const idSchema = z.string().min(1).max(64);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const id = idSchema.safeParse((await params).id);
  const presentation = id.success ? getPresentation(id.data, session.user) : null;
  if (!presentation) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const { bytes, warnings } = exportPresentationPptx(presentation, await pptxExportMedia(presentation));
    const name = pptxFileName(presentation.title);
    return new Response(new Uint8Array(bytes), { headers: {
      "Content-Type": PPTX_MIME,
      "Content-Disposition": `attachment; filename="${name.ascii}"; filename*=UTF-8''${name.encoded}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      // Codes only, so the editor can say which objects became placeholders.
      "X-Export-Warnings": [...new Set(warnings.map((warning) => warning.code))].join(","),
    } });
  } catch { return Response.json({ error: "Export unavailable: check media files and the 100 MB total media limit" }, { status: 422 }); }
}
