import { officeConfig } from "@/modules/wiki/office/config";
import { callbackPayloadSchema, defaultCallbackDeps, handleCallback } from "@/modules/wiki/office/callback";
import { verifyJwt } from "@/modules/wiki/office/tokens";

/**
 * ONLYOFFICE save callback. Only the payload inside the verified
 * `Authorization: Bearer` token is trusted; unsigned body fields are ignored.
 * `{"error":0}` is sent only once the state is persisted, otherwise the
 * document server retries.
 */
export async function POST(request: Request) {
  const config = officeConfig();
  if (!config) return Response.json({ error: 1 }, { status: 503 });
  const pageId = new URL(request.url).searchParams.get("page") ?? "";
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  let payload;
  try {
    const claims = verifyJwt(token, config.outboxSecret);
    payload = callbackPayloadSchema.parse(claims.payload);
  } catch {
    return Response.json({ error: 1, message: "invalid token" }, { status: 403 });
  }
  await request.body?.cancel().catch(() => {});
  try {
    const outcome = await handleCallback(pageId, payload, defaultCallbackDeps(config));
    if (!outcome.ok) console.warn(JSON.stringify({ event: "office_callback_ignored", pageId, key: payload.key, status: payload.status, reason: outcome.reason }));
    return Response.json({ error: 0 });
  } catch (error) {
    console.error(JSON.stringify({ event: "office_callback_failed", pageId, key: payload.key, status: payload.status, reason: error instanceof Error ? error.message : String(error) }));
    return Response.json({ error: 1 });
  }
}
