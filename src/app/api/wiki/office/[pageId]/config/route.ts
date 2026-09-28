import { getLocale } from "next-intl/server";
import { getSession } from "@/lib/auth";
import { officeConfig } from "@/modules/wiki/office/config";
import { buildEditorConfig } from "@/modules/wiki/office/editor-config";
import { getOfficePage } from "@/modules/wiki/office/queries";
import { getOrOpenSession, OfficeConflictError } from "@/modules/wiki/office/sessions";
import { headVersion } from "@/modules/wiki/office/store";

type Params = { params: Promise<{ pageId: string }> };

/** Browser-facing origin: nginx forwards the public host and scheme. */
function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(/:$/, "");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}

/** Opens (or joins) the editing session and returns the signed DocsAPI config. */
export async function GET(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const config = officeConfig();
  if (!config) return Response.json({ error: "officeUnavailable" }, { status: 503 });
  const { pageId } = await params;
  const page = getOfficePage(pageId);
  if (!page || page.engine !== "office") return Response.json({ error: "Not found" }, { status: 404 });
  const search = new URL(request.url).searchParams;
  try {
    const officeSession = await getOrOpenSession(page.id);
    const head = headVersion(page.id);
    if (!head) return Response.json({ error: "Not found" }, { status: 404 });
    const locale = (await getLocale()) === "en" ? "en" : "de";
    const editor = buildEditorConfig({
      config, page, locale, sessionKey: officeSession.key, head, origin: requestOrigin(request), canEdit: true,
      user: { id: session.user.id, name: session.user.name },
      plugin: {
        pageId: page.id,
        insertEvidenceId: search.get("insertEvidence") ?? undefined,
        focusTaskId: search.get("task") ?? undefined,
        focusDeadlineId: search.get("deadline") ?? undefined,
      },
    });
    return Response.json({ config: editor, apiUrl: `${config.publicPath}/web-apps/apps/api/documents/api.js` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof OfficeConflictError) return Response.json({ error: error.code }, { status: 409 });
    throw error;
  }
}
