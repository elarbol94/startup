import { getSession } from "@/lib/auth";
import { getOfficeConnections, getOfficePage } from "@/modules/wiki/office/queries";

type Params = { params: Promise<{ pageId: string }> };

/** Tasks, deadlines, cited sources and PDF evidence of an office document. */
export async function GET(_request: Request, { params }: Params) {
  if (!await getSession()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { pageId } = await params;
  const page = getOfficePage(pageId);
  if (!page || page.engine !== "office") return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(getOfficeConnections(page.id), { headers: { "Cache-Control": "no-store" } });
}
