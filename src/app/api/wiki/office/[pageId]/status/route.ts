import { getSession } from "@/lib/auth";
import { getOfficePage, getOfficeStatus } from "@/modules/wiki/office/queries";

type Params = { params: Promise<{ pageId: string }> };

/** What the app has durably stored (distinct from "synced to the editor"). */
export async function GET(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { pageId } = await params;
  const page = getOfficePage(pageId);
  const status = page?.engine === "office" ? getOfficeStatus(page.id) : null;
  if (!status) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}
