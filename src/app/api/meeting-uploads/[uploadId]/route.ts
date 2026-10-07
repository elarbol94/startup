import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { loadUploadSession } from "@/modules/meetings/processing/uploads";

type Params = { params: Promise<{ uploadId: string }> };

/** Upload progress for the uploader: received chunks and the background state. */
export async function GET(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const upload = loadUploadSession((await params).uploadId);
  if (!upload || upload.userId !== session.user.id) return NextResponse.json({ error: "notFound" }, { status: 404 });
  return NextResponse.json({
    state: upload.state,
    receivedChunks: JSON.parse(upload.receivedChunks) as number[],
    chunkCount: upload.chunkCount,
    recordingId: upload.recordingId,
    error: upload.error,
  });
}
