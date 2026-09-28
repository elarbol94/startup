import { MAX_UPLOAD_BYTES } from "@/lib/files";
import type { OfficeConfig } from "./config";
import { signJwt } from "./tokens";

export class OfficeHttpError extends Error {}

const TIMEOUT_MS = 30_000;

/**
 * The document server reports result files under the browser-facing origin
 * (`https://host/office/cache/files/...`). We never contact that host: only the
 * cache path is accepted, and it is always fetched from the internal URL, so a
 * forged callback cannot make the app request an arbitrary address.
 */
export function internalCacheUrl(reported: string, config: OfficeConfig): string {
  let url: URL;
  try { url = new URL(reported); } catch { throw new OfficeHttpError("invalid url"); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new OfficeHttpError("invalid url");
  let pathname = url.pathname;
  if (pathname.startsWith(config.publicPath + "/")) pathname = pathname.slice(config.publicPath.length);
  if (!pathname.startsWith("/cache/files/") || pathname.includes("..") || pathname.includes("//")) throw new OfficeHttpError("unexpected document server path");
  return `${config.internalUrl}${pathname}${url.search}`;
}

async function readCapped(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new OfficeHttpError("response too large");
  if (!response.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new OfficeHttpError("response too large"); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

/** Downloads a document-server result file (callback `url`/`changesurl`, conversions). */
export async function downloadFromDocServer(reported: string, config: OfficeConfig, maxBytes = MAX_UPLOAD_BYTES) {
  const response = await fetch(internalCacheUrl(reported, config), { redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new OfficeHttpError(`download failed: ${response.status}`);
  return readCapped(response, maxBytes);
}

/** POSTs a signed JSON request to the document server (CommandService, ConvertService). */
export async function postToDocServer<T>(path: "/command" | "/converter", payload: Record<string, unknown>, config: OfficeConfig): Promise<T> {
  const response = await fetch(`${config.internalUrl}${path}`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${signJwt({ payload }, config.inboxSecret)}` },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new OfficeHttpError(`document server ${path} failed: ${response.status}`);
  return JSON.parse((await readCapped(response, 1024 * 1024)).toString("utf8")) as T;
}
