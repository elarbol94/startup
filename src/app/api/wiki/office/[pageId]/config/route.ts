import { randomUUID } from "node:crypto";
import { getLocale } from "next-intl/server";
import { getSession } from "@/lib/auth";
import { officeConfig } from "@/modules/wiki/office/config";
import { buildEditorConfig, requestOrigin } from "@/modules/wiki/office/editor-config";
import { getOfficePage } from "@/modules/wiki/office/queries";
import { getOrOpenSession, OfficeConflictError } from "@/modules/wiki/office/sessions";
import { headVersion } from "@/modules/wiki/office/store";

type Params = { params: Promise<{ pageId: string }> };

/** DocsAPI actionLink from a mention notification (opaque JSON object). */
function parseActionLink(value: string | null) {
  if (!value || value.length > 4000) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
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
    const bridgeId = randomUUID();
    const editor = buildEditorConfig({
      config, page, locale, sessionKey: officeSession.key, head, origin: requestOrigin(request), canEdit: true,
      theme: search.get("theme") === "dark" ? "dark" : "light",
      actionLink: parseActionLink(search.get("officeAction")),
      user: { id: session.user.id, name: session.user.name },
      plugin: {
        pageId: page.id,
        bridgeId,
        userId: session.user.id,
        userName: session.user.name,
        insertEvidenceId: search.get("insertEvidence") ?? undefined,
        focusTaskId: search.get("task") ?? undefined,
        focusDeadlineId: search.get("deadline") ?? undefined,
      },
    });
    return Response.json({ config: editor, bridgeId, apiUrl: `${config.publicPath}/web-apps/apps/api/documents/api.js` }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof OfficeConflictError) return Response.json({ error: error.code }, { status: 409 });
    throw error;
  }
}
