import fs from "node:fs";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { wikiOfficeVersions } from "@/db/schema";
import { getAttachment, getAttachmentAbsolutePath } from "@/lib/files";
import { verifyFileToken } from "@/modules/wiki/office/tokens";

/**
 * Serves one stored office file to the document server. Authenticated only by
 * a short-lived token bound to page, version and resource (no session: the
 * document server fetches it over the internal network).
 */
export async function GET(request: Request) {
  let claims;
  try {
    claims = verifyFileToken(new URL(request.url).searchParams.get("token") ?? "");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const column = claims.res === "docx" ? wikiOfficeVersions.attachmentId : wikiOfficeVersions.changesAttachmentId;
  const version = db.select({ id: wikiOfficeVersions.id }).from(wikiOfficeVersions).where(and(
    eq(wikiOfficeVersions.id, claims.versionId),
    eq(wikiOfficeVersions.pageId, claims.pageId),
    eq(column, claims.attachmentId),
  )).get();
  const attachment = version ? getAttachment(claims.attachmentId) : undefined;
  if (!attachment || attachment.entityType !== "wikiOfficeDocument" || attachment.entityId !== claims.pageId) return new Response("Not found", { status: 404 });
  let data: Buffer;
  try { data = await fs.promises.readFile(getAttachmentAbsolutePath(attachment.storedName)); }
  catch { return new Response("File missing", { status: 404 }); }
  return new Response(new Uint8Array(data), { headers: { "Content-Type": attachment.mimeType, "Content-Length": String(data.byteLength), "Cache-Control": "no-store" } });
}
