import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { wikiPages } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { CITATION_STYLES, isCitationStyle, type CitationStyle } from "@/modules/wiki/lib/citations";
import { formatDocumentCitations, searchCitationSources } from "@/modules/wiki/office/citations";
import { getOfficePage } from "@/modules/wiki/office/queries";

/** Used by the ONLYOFFICE plugin (same origin, session cookie). */
function pageCitationSettings(pageId: string) {
  const page = getOfficePage(pageId);
  if (!page || page.engine !== "office") return null;
  const row = db.select({ locale: wikiPages.citationLocale, style: wikiPages.citationStyle }).from(wikiPages).where(eq(wikiPages.id, page.id)).get()!;
  return { pageId: page.id, locale: row.locale, style: (isCitationStyle(row.style) ? row.style : "ieee") as CitationStyle };
}

export async function GET(request: Request) {
  if (!await getSession()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const search = new URL(request.url).searchParams;
  const settings = pageCitationSettings(search.get("page") ?? "");
  if (!settings) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ...settings, styles: CITATION_STYLES, sources: searchCitationSources(search.get("q") ?? "", settings.locale, settings.style) });
}

const formatSchema = z.object({
  pageId: z.string().min(1),
  items: z.array(z.object({ ids: z.array(z.string().min(1).max(64)).min(1).max(50), loc: z.string().max(120).optional() })).max(2000),
});

export async function POST(request: Request) {
  if (!await getSession()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = formatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const settings = pageCitationSettings(parsed.data.pageId);
  if (!settings) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(formatDocumentCitations(parsed.data.items, settings.locale, settings.style));
}

const settingsSchema = z.object({ pageId: z.string().min(1), style: z.enum(CITATION_STYLES), locale: z.enum(["de-DE", "en-US"]) });

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  if (!pageCitationSettings(parsed.data.pageId)) return Response.json({ error: "Not found" }, { status: 404 });
  db.update(wikiPages).set({ citationStyle: parsed.data.style, citationLocale: parsed.data.locale, updatedBy: session.user.id, updatedAt: new Date() }).where(eq(wikiPages.id, parsed.data.pageId)).run();
  return Response.json({ ok: true });
}
