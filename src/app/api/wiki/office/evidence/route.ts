import { and, desc, eq, isNull, like, or } from "drizzle-orm";
import { db } from "@/db";
import { wikiPdfAnnotations, wikiSources } from "@/db/schema";
import { getSession } from "@/lib/auth";

/** PDF highlights the ONLYOFFICE plugin can insert as evidence controls. */
export async function GET(request: Request) {
  if (!await getSession()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const search = new URL(request.url).searchParams;
  const id = search.get("id");
  const query = (search.get("q") ?? "").trim().slice(0, 100);
  const rows = db.select({
    id: wikiPdfAnnotations.id, sourceId: wikiPdfAnnotations.sourceId, documentId: wikiPdfAnnotations.documentId,
    pageNumber: wikiPdfAnnotations.pageNumber, selectedText: wikiPdfAnnotations.selectedText, label: wikiPdfAnnotations.label,
    sourceTitle: wikiSources.title,
  }).from(wikiPdfAnnotations)
    .innerJoin(wikiSources, eq(wikiSources.id, wikiPdfAnnotations.sourceId))
    .where(and(
      isNull(wikiPdfAnnotations.deletedAt),
      id ? eq(wikiPdfAnnotations.id, id) : undefined,
      query ? or(like(wikiPdfAnnotations.selectedText, `%${query}%`), like(wikiSources.title, `%${query}%`), like(wikiPdfAnnotations.label, `%${query}%`)) : undefined,
    ))
    .orderBy(desc(wikiPdfAnnotations.createdAt))
    .limit(id ? 1 : 30)
    .all();
  return Response.json({
    items: rows.map((row) => ({
      ...row,
      href: `/wiki/sources/${row.sourceId}/read/${row.documentId}?page=${row.pageNumber}&annotation=${row.id}`,
    })),
  });
}
