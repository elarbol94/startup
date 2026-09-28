import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { wikiPages } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { renderStoredWikiDocument } from "@/modules/wiki/lib/document-pdf";
import { getWikiTypographyForUser } from "@/modules/wiki/lib/wiki-typography.server";

function disposition(slug: string, inline: boolean) {
  const safe = slug.replace(/[^a-z0-9_-]+/gi, "-") || "document";
  return `${inline ? "inline" : "attachment"}; filename="${safe}.html"`;
}

/**
 * Read-only HTML of a page's old-editor body: "Fassung vor der Umstellung" for
 * converted Word documents and the preview of pages restored from the trash.
 * Word documents export through ONLYOFFICE (`/api/wiki/office/[pageId]/export`).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const page = db.select({ createdBy: wikiPages.createdBy })
    .from(wikiPages)
    .where(and(eq(wikiPages.id, id), isNull(wikiPages.deletedAt)))
    .get();
  if (!page) return Response.json({ error: "Page not found" }, { status: 404 });
  const url = new URL(request.url);
  if ((url.searchParams.get("format") ?? "html") !== "html") return Response.json({ error: "Unsupported export format" }, { status: 400 });
  try {
    const { page: stored, rendered } = await renderStoredWikiDocument(id, getWikiTypographyForUser(page.createdBy));
    return new Response(rendered.html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": disposition(stored.slug, url.searchParams.get("disposition") === "inline"),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Document export failed";
    return Response.json({ error: message }, { status: message === "Page not found" ? 404 : 500 });
  }
}
