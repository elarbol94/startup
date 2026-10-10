import { randomUUID } from "node:crypto";
import { getLocale } from "next-intl/server";
import { getSession } from "@/lib/auth";
import { officeConfig } from "@/modules/wiki/office/config";
import { buildScratchEditorConfig, requestOrigin } from "@/modules/wiki/office/editor-config";
import { getOfficePage } from "@/modules/wiki/office/queries";
import { newScratchKey } from "@/modules/wiki/office/scratch";

type Params = { params: Promise<{ pageId: string }> };

/**
 * Signed DocsAPI config for the section editor: a temporary scratch document
 * (never stored) whose workspace plugin runs in "section" mode.
 */
export async function GET(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const config = officeConfig();
  if (!config) return Response.json({ error: "officeUnavailable" }, { status: 503 });
  const { pageId } = await params;
  const page = getOfficePage(pageId);
  if (!page || page.engine !== "office") return Response.json({ error: "Not found" }, { status: 404 });
  const locale = (await getLocale()) === "en" ? "en" : "de";
  const bridgeId = randomUUID();
  const editor = buildScratchEditorConfig({
    config, page, locale, origin: requestOrigin(request), scratchKey: newScratchKey(),
    theme: new URL(request.url).searchParams.get("theme") === "dark" ? "dark" : "light",
    user: { id: session.user.id, name: session.user.name },
    plugin: { pageId: page.id, bridgeId, userId: session.user.id, userName: session.user.name, mode: "section" },
  });
  return Response.json({ config: editor, bridgeId, apiUrl: `${config.publicPath}/web-apps/apps/api/documents/api.js` }, { headers: { "Cache-Control": "no-store" } });
}
