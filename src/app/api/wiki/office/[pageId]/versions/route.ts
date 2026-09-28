import { getSession } from "@/lib/auth";
import { getOfficePage, listOfficeVersions } from "@/modules/wiki/office/queries";

type Params = { params: Promise<{ pageId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { pageId } = await params;
  const page = getOfficePage(pageId);
  if (!page || page.engine !== "office") return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ versions: listOfficeVersions(page.id) }, { headers: { "Cache-Control": "no-store" } });
}
