import { getSession } from "@/lib/auth";

/**
 * Tells the editor where the live-collaboration WebSocket server listens.
 *
 * - COLLAB_PUBLIC_URL, if set (e.g. wss://startup.example.at/collab).
 * - In production: `/collab` on the host the browser used, which a reverse
 *   proxy or Cloudflare Tunnel route forwards to COLLAB_PORT.
 * - In development: COLLAB_PORT (default 3001) on the same host.
 */
export async function GET(request: Request) {
  const login = await getSession();
  if (!login) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ url: socketUrl(request), user: { id: login.user.id, name: login.user.name } }, { headers: { "Cache-Control": "no-store" } });
}

function socketUrl(request: Request) {
  const configured = process.env.COLLAB_PUBLIC_URL?.trim();
  if (configured) return configured;
  const requestUrl = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const secure = (forwardedProto ?? requestUrl.protocol.replace(":", "")) === "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host;
  const scheme = secure ? "wss" : "ws";
  if (process.env.NODE_ENV === "production") return `${scheme}://${host}/collab`;
  const hostname = new URL(`http://${host}`).hostname;
  return `${scheme}://${hostname.includes(":") ? `[${hostname}]` : hostname}:${Number(process.env.COLLAB_PORT ?? 3001)}`;
}
