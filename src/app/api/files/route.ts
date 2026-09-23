import { db } from "@/db";
import { isBugReport, saveBugScreenshot } from "@/modules/projects/bugs/uploads";
import { wikiFigureRevisions } from "@/db/schema";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { limitedRequest } from "@/lib/request-body";
import { attachmentAccessError } from "@/lib/attachment-access";
import {
  isAttachmentEntityType,
  listAttachmentsFor,
  MAX_UPLOAD_BYTES,
  saveAttachment,
  UploadError,
} from "@/lib/files";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const entityType = url.searchParams.get("entityType") ?? "";
  const entityId = url.searchParams.get("entityId") ?? "";
  if (!isAttachmentEntityType(entityType) || !entityId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (attachmentAccessError(session.user, entityType, entityId, "read")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const immutable = entityType === "wikiPage" ? new Set(db.select({ id: wikiFigureRevisions.attachmentId }).from(wikiFigureRevisions).all().map((row) => row.id)) : new Set<string>();
  return NextResponse.json(listAttachmentsFor(entityType, entityId).filter((file) => !immutable.has(file.id)));
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // One file plus a few form fields.
  const bounded = await limitedRequest(request, MAX_UPLOAD_BYTES + 1024 * 1024);
  if (!bounded) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  const formData = await bounded.formData();
  const file = formData.get("file");
  const entityType = formData.get("entityType");
  const entityId = formData.get("entityId");

  if (
    !(file instanceof File) ||
    typeof entityType !== "string" ||
    typeof entityId !== "string" ||
    !isAttachmentEntityType(entityType) ||
    !entityId
  ) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const denied = attachmentAccessError(session.user, entityType, entityId, "upload");
    if (denied) return NextResponse.json({ error: denied === 404 ? "Not found" : "Forbidden" }, { status: denied });
    // Only the bug-report screenshot flow sends uploadId (idempotent retries);
    // other files on a bug task are ordinary task attachments.
    const attachment = entityType === "task" && formData.has("uploadId") && isBugReport(entityId)
      ? await saveBugScreenshot(file, entityId, session.user.id, formData.get("uploadId"))
      : await saveAttachment({
      file,
      entityType,
      entityId,
      userId: session.user.id,
    });
    revalidatePath("/documents");
    return NextResponse.json(attachment);
  } catch (error) {
    if (error instanceof UploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
