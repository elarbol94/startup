import { z } from "zod";
import { getSession } from "@/lib/auth";
import { sqlite } from "@/db";
import { applyRoomUpdate, authorize, loadRoom, replayRoom, roomKey, wireRoom } from "@/modules/wiki/collaboration/store";

const paramsSchema = z.object({ kind: z.enum(["page", "presentation"]), id: z.string().min(1).max(200) });
const bodySchema = z.object({
  update: z.string().max(4_000_000).regex(/^[A-Za-z0-9+/]*={0,2}$/).optional(),
  client: z.string().uuid(),
  presence: z.object({ cursor: z.object({ anchor: z.string().max(1000), head: z.string().max(1000) }).nullable().optional(), selectedIds: z.array(z.string().max(64)).max(500).optional() }).optional(),
});
type Context = { params: Promise<{ kind: string; id: string }> };
export async function POST(request: Request, context: Context) {
  const login = await getSession();
  if (!login) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && origin !== process.env.BETTER_AUTH_URL) return Response.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { kind, id } = paramsSchema.parse(await context.params);
    authorize(kind, id, login.user, login.session.id);
    // Bound actual streamed bytes, not only the untrusted Content-Length header.
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Missing body");
    let size = 0; const chunks: Uint8Array[] = [];
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4_100_000) { await reader.cancel(); return Response.json({ error: "Too large" }, { status: 413 }); }
      chunks.push(chunk.value);
    }
    const input = bodySchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    authorize(kind, id, login.user, login.session.id);
    const room = input.update ? applyRoomUpdate(kind, id, input.update, login.user) : loadRoom(kind, id);
    if (input.presence) sqlite.prepare("INSERT INTO wiki_collaboration_presence (room, session, user_id, awareness, touched_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(room, session) DO UPDATE SET awareness = excluded.awareness, touched_at = excluded.touched_at WHERE user_id = excluded.user_id")
      .run(room.key, input.client, login.user.id, JSON.stringify({ ...input.presence, name: login.user.name, userId: login.user.id }), Date.now());
    sqlite.prepare("DELETE FROM wiki_collaboration_presence WHERE touched_at < ?").run(Date.now() - 30_000);
    return Response.json(wireRoom(room));
  } catch (error) {
    const denied = error instanceof Error && /access|unavailable/i.test(error.message);
    return Response.json({ error: denied ? "Access denied" : "Invalid collaboration update" }, { status: denied ? 403 : 400 });
  }
}
export async function GET(request: Request, context: Context) {
  const login = await getSession();
  if (!login) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = paramsSchema.safeParse(await context.params);
  if (!parsed.success) return Response.json({ error: "Invalid room" }, { status: 400 });
  const { kind, id } = parsed.data;
  try { authorize(kind, id, login.user, login.session.id); } catch { return Response.json({ error: "Access denied" }, { status: 403 }); }
  if (!new URL(request.url).searchParams.has("stream")) return Response.json({ ...wireRoom(loadRoom(kind, id)), user: { id: login.user.id, name: login.user.name } }, { headers: { "Cache-Control": "no-store" } });
  let after = Number(request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("after") ?? 0);
  if (!Number.isSafeInteger(after) || after < 0) after = 0;
  const encoder = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let previousPresence = "";
      const emit = (event: string, data: unknown, sequence?: number) => controller.enqueue(encoder.encode(`${sequence === undefined ? "" : `id: ${sequence}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const tick = () => {
        if (closed) return;
        try {
          authorize(kind, id, login.user, login.session.id);
          const update = replayRoom(kind, id, after);
          if (update) { emit("update", update, update.sequence); after = update.sequence; }
          const presence = sqlite.prepare("SELECT session, awareness FROM wiki_collaboration_presence WHERE room = ? AND touched_at > ? ORDER BY session").all(roomKey(kind, id), Date.now() - 15_000) as { session: string; awareness: string }[];
          const wire = JSON.stringify(presence);
          if (wire !== previousPresence) { emit("presence", presence.map(row => ({ client: row.session, ...JSON.parse(row.awareness) }))); previousPresence = wire; }
        } catch { emit("denied", {}); stop(); }
      };
      const timer = setInterval(tick, 250);
      const heartbeat = setInterval(() => { if (!closed) controller.enqueue(encoder.encode(": heartbeat\n\n")); }, 10_000);
      stop = () => { if (closed) return; closed = true; clearInterval(timer); clearInterval(heartbeat); request.signal.removeEventListener("abort", stop); try { controller.close(); } catch { /* The reader may have already cancelled the stream. */ } };
      request.signal.addEventListener("abort", stop);
      if (request.signal.aborted) stop(); else tick();
    },
    cancel() { stop(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
