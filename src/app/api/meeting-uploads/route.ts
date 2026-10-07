import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { meetingFor } from "@/modules/meetings/access";
import { MEDIA_CHUNK_BYTES } from "@/modules/meetings/constants";
import { createUploadSession } from "@/modules/meetings/processing/uploads";
import { revalidateMeeting } from "@/modules/meetings/action-helpers";

const initSchema = z.object({
  meetingId: z.string().min(1),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
  declaration: z.object({ participantsInformed: z.boolean(), aiProcessing: z.boolean() }),
});

/** Starts a resumable recording upload; see modules/meetings/processing/uploads.ts. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const text = await request.text();
  if (text.length > 4096) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const parsed = initSchema.safeParse((() => { try { return JSON.parse(text); } catch { return null; } })());
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const access = meetingFor(parsed.data.meetingId, session.user, "contribute");
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.error === "notFound" ? 404 : 403 });
  const result = createUploadSession({ ...parsed.data, userId: session.user.id });
  if (!result.ok) {
    const status = result.error === "notFound" ? 404 : result.error === "disk" || result.error === "quota" ? 507 : result.error === "tooLarge" ? 413 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }
  revalidateMeeting(parsed.data.meetingId);
  return NextResponse.json({ uploadId: result.session.id, chunkBytes: MEDIA_CHUNK_BYTES, chunkCount: result.session.chunkCount });
}
