import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { limitedRequest } from "@/lib/request-body";
import { CalendarFeedError, importCalendarFile } from "@/modules/calendar/ics-sync";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** One-time import of an .ics file or a Google Calendar export (.zip) into a calendar. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "forbidden" }, { status: 403 });
  const bounded = await limitedRequest(request, MAX_UPLOAD_BYTES + 64 * 1024);
  if (!bounded) return Response.json({ error: "too_large" }, { status: 413 });
  const data = await bounded.formData().catch(() => null);
  const file = data?.get("file");
  const calendarId = data?.get("calendarId");
  if (!(file instanceof File) || typeof calendarId !== "string" || !calendarId || file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "not_calendar" }, { status: 400 });
  }
  try {
    const result = importCalendarFile({
      calendarId,
      userId: session.user.id,
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    revalidatePath("/calendar");
    revalidatePath("/");
    return Response.json(result);
  } catch (error) {
    if (error instanceof CalendarFeedError) return Response.json({ error: error.code }, { status: 422 });
    // requireCalendarEditor: no edit rights, or a read-only subscribed calendar.
    if (error instanceof Error && /permission|read-only/.test(error.message)) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    throw error;
  }
}
