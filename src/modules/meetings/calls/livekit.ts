import "server-only";

import path from "node:path";
import {
  AccessToken,
  DirectFileOutput,
  EgressClient,
  RoomServiceClient,
  WebhookReceiver,
  type EgressInfo,
} from "livekit-server-sdk";

/**
 * LiveKit runs next to the app (Compose profile `meetings`). The app reaches
 * its server API on the internal network; browsers reach signaling through
 * nginx at /livekit and media over the Tailscale address only.
 */
export function livekitConfig() {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim() ?? "";
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim() ?? "";
  return {
    enabled: Boolean(apiKey && apiSecret),
    apiKey,
    apiSecret,
    internalUrl: process.env.LIVEKIT_URL?.trim() || "http://livekit:7880",
    /** Browser signaling URL; a path is resolved against the page's origin. */
    publicUrl: process.env.LIVEKIT_PUBLIC_URL?.trim() || "/livekit",
    /** Where the app sees the recorder's output files. */
    egressDir: process.env.LIVEKIT_EGRESS_DIR?.trim() || path.join(process.cwd(), "data", "egress"),
    /** The same directory as seen by the egress container. */
    egressOutputDir: process.env.LIVEKIT_EGRESS_OUTPUT_DIR?.trim() || "/out",
  };
}

export class CallsDisabledError extends Error {
  constructor() { super("Calls are not configured (LIVEKIT_API_KEY / LIVEKIT_API_SECRET)"); }
}

function clients() {
  const config = livekitConfig();
  if (!config.enabled) throw new CallsDisabledError();
  return {
    rooms: new RoomServiceClient(config.internalUrl, config.apiKey, config.apiSecret),
    egress: new EgressClient(config.internalUrl, config.apiKey, config.apiSecret),
  };
}

export async function createCallRoom(roomName: string) {
  // Rooms are never created implicitly (`auto_create: false`), so an old token cannot revive an ended call.
  await clients().rooms.createRoom({ name: roomName, emptyTimeout: 10 * 60, maxParticipants: 50 });
}

export async function deleteCallRoom(roomName: string) {
  try {
    await clients().rooms.deleteRoom(roomName);
  } catch (error) {
    // Already gone is fine; anything else is reported.
    if (!/not.?found|does not exist/i.test(String(error))) throw error;
  }
}

export async function callRoomExists(roomName: string) {
  return (await clients().rooms.listRooms([roomName])).some((room) => room.name === roomName);
}

export async function listCallParticipants(roomName: string) {
  return clients().rooms.listParticipants(roomName);
}

/** A short-lived token for one device. Browser tokens never carry admin or recording grants. */
export async function createJoinToken(input: { roomName: string; identity: string; name: string; canPublish: boolean }) {
  const config = livekitConfig();
  if (!config.enabled) throw new CallsDisabledError();
  const token = new AccessToken(config.apiKey, config.apiSecret, { identity: input.identity, name: input.name, ttl: "10m" });
  token.addGrant({
    room: input.roomName,
    roomJoin: true,
    canSubscribe: true,
    canPublish: input.canPublish,
    canPublishData: true,
    canUpdateOwnMetadata: false,
  });
  return token.toJwt();
}

/** Records one track to `<fileName>` in the egress output directory, without transcoding. */
export async function startTrackRecording(roomName: string, trackSid: string, fileName: string): Promise<EgressInfo> {
  const config = livekitConfig();
  return clients().egress.startTrackEgress(roomName, new DirectFileOutput({ filepath: path.posix.join(config.egressOutputDir, fileName) }), trackSid);
}

export async function listRoomEgress(roomName: string) {
  return clients().egress.listEgress({ roomName });
}

export async function stopRecording(egressId: string) {
  try {
    await clients().egress.stopEgress(egressId);
  } catch (error) {
    if (!/not.?found|cannot be stopped|already/i.test(String(error))) throw error;
  }
}

export function webhookReceiver() {
  const config = livekitConfig();
  if (!config.enabled) throw new CallsDisabledError();
  return new WebhookReceiver(config.apiKey, config.apiSecret);
}

/** The output file name an egress writes (from its request or its result). */
export function egressFileName(info: EgressInfo) {
  const request = info.request.case === "track" ? info.request.value : undefined;
  const requested = request?.output.case === "file" ? request.output.value.filepath : "";
  const written = info.fileResults[0]?.filename ?? "";
  return path.posix.basename(requested || written);
}
