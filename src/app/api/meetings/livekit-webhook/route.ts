import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { TrackType } from "livekit-server-sdk";
import { db } from "@/db";
import { livekitConfig, webhookReceiver } from "@/modules/meetings/calls/livekit";
import { endCallSession, ensureTrackRecording, syncEgress } from "@/modules/meetings/calls/recording";
import { meetingCallSessions, meetingWebhookEvents } from "@/modules/meetings/schema";

/**
 * LiveKit webhooks, sent on the internal network (nginx does not expose this
 * path). The signature is verified, each event is handled once, and every
 * handler is idempotent because the reconciler repeats the same work.
 */
export async function POST(request: Request) {
  if (!livekitConfig().enabled) return NextResponse.json({ error: "disabled" }, { status: 404 });
  const body = await request.text();
  if (body.length > 256 * 1024) return NextResponse.json({ error: "too large" }, { status: 413 });
  let event;
  try {
    event = await webhookReceiver().receive(body, request.headers.get("authorization") ?? undefined);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  if (event.id) {
    const fresh = db.insert(meetingWebhookEvents).values({ eventId: event.id }).onConflictDoNothing().run().changes;
    if (!fresh) return NextResponse.json({ ok: true });
  }
  const session = event.room?.name
    ? db.select().from(meetingCallSessions).where(eq(meetingCallSessions.roomName, event.room.name)).get()
    : undefined;
  try {
    if (event.event === "track_published" && session && event.participant && event.track?.type === TrackType.AUDIO) {
      await ensureTrackRecording(session, event.participant.identity, event.track.sid);
    } else if (event.event.startsWith("egress_") && event.egressInfo) {
      await syncEgress(event.egressInfo);
    } else if (event.event === "room_finished" && session?.status === "open") {
      await endCallSession(session, "roomFinished", null);
    }
  } catch (error) {
    // The reconciler retries; tell LiveKit the event arrived.
    console.error(JSON.stringify({ event: "meeting_webhook_failed", type: event.event, error: error instanceof Error ? error.message : String(error) }));
  }
  return NextResponse.json({ ok: true });
}
