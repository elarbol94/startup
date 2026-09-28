import { getSession } from "@/lib/auth";
import { officeConfig } from "@/modules/wiki/office/config";
import { convertVersionToPdf } from "@/modules/wiki/office/convert-pdf";
import { getOfficePage, getOfficeVersion } from "@/modules/wiki/office/queries";
import { headVersion, readVersionFile } from "@/modules/wiki/office/store";

type Params = { params: Promise<{ pageId: string }> };

const disposition = (slug: string, extension: string) => `attachment; filename="${slug.replace(/[^a-z0-9_-]+/gi, "-") || "document"}.${extension}"`;

/**
 * Exports a *stored* version (the head unless `version` is given). The open
 * editor exports its live state through DocsAPI `downloadAs` instead.
 */
export async function GET(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { pageId } = await params;
  const page = getOfficePage(pageId);
  if (!page || page.engine !== "office") return Response.json({ error: "Not found" }, { status: 404 });
  const search = new URL(request.url).searchParams;
  const format = search.get("format") ?? "docx";
  if (format !== "docx" && format !== "pdf") return Response.json({ error: "Unsupported export format" }, { status: 400 });
  const requested = search.get("version");
  const version = requested ? getOfficeVersion(page.id, requested) : headVersion(page.id);
  if (!version) return Response.json({ error: "Not found" }, { status: 404 });
  const headers = { "Cache-Control": "no-store", "X-Stored-At": String(version.createdAt.getTime()), "X-Version": String(version.version) };
  if (format === "docx") {
    return new Response(new Uint8Array(readVersionFile(version.attachmentId)), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": disposition(page.slug, "docx") } });
  }
  const config = officeConfig();
  if (!config) return Response.json({ error: "officeUnavailable" }, { status: 503 });
  try {
    const pdf = await convertVersionToPdf(config, page, version);
    return new Response(new Uint8Array(pdf), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": disposition(page.slug, "pdf") } });
  } catch (error) {
    console.error(JSON.stringify({ event: "office_pdf_export_failed", pageId: page.id, reason: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: "conversionFailed" }, { status: 502 });
  }
}
