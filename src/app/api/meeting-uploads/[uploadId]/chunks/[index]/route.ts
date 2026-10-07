import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { meetingFor } from "@/modules/meetings/access";
import { expectedChunkBytes, loadUploadSession, writeUploadChunk } from "@/modules/meetings/processing/uploads";

type Params = { params: Promise<{ uploadId: string; index: string }> };

/**
 * Receives one chunk as the raw request body (streamed to disk, never
 * buffered). Only the uploader who still has access to the meeting may send.
 */
export async function PUT(request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { uploadId, index } = await params;
  const upload = loadUploadSession(uploadId);
  if (!upload || upload.userId !== session.user.id) return NextResponse.json({ error: "notFound" }, { status: 404 });
  if (!meetingFor(upload.meetingId, session.user, "contribute").ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const chunkIndex = Number(index);
  const declared = Number(request.headers.get("content-length") ?? NaN);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= upload.chunkCount) return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (Number.isFinite(declared) && declared !== expectedChunkBytes(upload, chunkIndex)) return NextResponse.json({ error: "chunk" }, { status: 400 });
  if (!request.body) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const error = await writeUploadChunk(upload, chunkIndex, request.body, request.headers.get("x-chunk-sha256") ?? "");
  if (error) return NextResponse.json({ error }, { status: error === "state" ? 409 : 400 });
  return NextResponse.json({ ok: true });
}
