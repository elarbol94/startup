import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { meetingFor } from "@/modules/meetings/access";
import { revalidateMeeting } from "@/modules/meetings/action-helpers";
import { loadUploadSession, requestUploadCompletion } from "@/modules/meetings/processing/uploads";

type Params = { params: Promise<{ uploadId: string }> };

/** All chunks are in: the worker assembles and stores the file in the background. */
export async function POST(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const upload = loadUploadSession((await params).uploadId);
  if (!upload || upload.userId !== session.user.id) return NextResponse.json({ error: "notFound" }, { status: 404 });
  if (!meetingFor(upload.meetingId, session.user, "contribute").ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const error = requestUploadCompletion(upload);
  if (error) return NextResponse.json({ error }, { status: 409 });
  revalidateMeeting(upload.meetingId);
  return NextResponse.json({ ok: true }, { status: 202 });
}
