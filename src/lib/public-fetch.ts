import dns from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import net from "node:net";

/** True for loopback, private, link-local, CGNAT, multicast and other non-public ranges (incl. IPv4-mapped IPv6). */
export function privateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const value = address.split(".").map(Number).reduce((result, part) => ((result << 8) | part) >>> 0, 0);
    const inCidr = (base: number, bits: number) => (value >>> (32 - bits)) === (base >>> (32 - bits));
    return inCidr(0x00000000, 8)
      || inCidr(0x0a000000, 8)
      || inCidr(0x64400000, 10)
      || inCidr(0x7f000000, 8)
      || inCidr(0xa9fe0000, 16)
      || inCidr(0xac100000, 12)
      || inCidr(0xc0000000, 24)
      || inCidr(0xc0000200, 24)
      || inCidr(0xc0a80000, 16)
      || inCidr(0xc6120000, 15)
      || inCidr(0xc6336400, 24)
      || inCidr(0xcb007100, 24)
      || inCidr(0xe0000000, 4)
      || inCidr(0xf0000000, 4);
  }
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice(7);
    if (net.isIPv4(mapped)) return privateAddress(mapped);
    const parts = mapped.split(":");
    if (parts.length === 2 && parts.every((part) => /^[\da-f]{1,4}$/.test(part))) {
      const high = Number.parseInt(parts[0], 16);
      const low = Number.parseInt(parts[1], 16);
      return privateAddress(`${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`);
    }
  }
  if (normalized.startsWith("::")) {
    const compatible = normalized.slice(2);
    const parts = compatible.split(":").filter(Boolean);
    if (net.isIPv4(compatible) || (parts.length <= 2 && parts.every((part) => /^[\da-f]{1,4}$/.test(part)))) {
      return true;
    }
  }
  const first = Number.parseInt(normalized.split(":").find(Boolean) ?? "0", 16);
  return normalized === "::"
    || normalized === "::1"
    || (first & 0xfe00) === 0xfc00
    || (first & 0xffc0) === 0xfe80
    || (first & 0xffc0) === 0xfec0
    || (first & 0xff00) === 0xff00;
}

type PublicTarget = { url: URL; hostname: string; address: string; family: number };

async function resolvePublicUrl(value: string): Promise<PublicTarget> {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Only HTTP(S) URLs are supported");
  if (url.username || url.password) throw new Error("URLs with credentials are not supported");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await dns.lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((entry) => privateAddress(entry.address))) throw new Error("Private network URLs are not allowed");
  return { url, hostname, address: addresses[0].address, family: addresses[0].family };
}

type PinnedResponse = { status: number; location: string; contentType: string; body: string };

/** Connects to the already-checked address, so a second DNS answer (rebinding) cannot redirect the request. */
function requestPinned(target: PublicTarget, options: { maxBytes: number; headers: Record<string, string> }) {
  return new Promise<PinnedResponse>((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | null, response?: PinnedResponse) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve(response!);
    };
    const lookup: net.LookupFunction = (hostname, lookupOptions, callback) => {
      if (hostname !== target.hostname) {
        callback(new Error("Unexpected lookup target"), "", 0);
        return;
      }
      if (lookupOptions.all) {
        callback(null, [{ address: target.address, family: target.family }]);
        return;
      }
      callback(null, target.address, target.family);
    };
    const request = (target.url.protocol === "https:" ? httpsRequest : httpRequest)(
      target.url,
      { headers: options.headers, lookup, signal: AbortSignal.timeout(8_000) },
      (response) => {
        const status = response.statusCode ?? 0;
        const head = {
          status,
          location: String(response.headers.location ?? ""),
          contentType: String(response.headers["content-type"] ?? ""),
        };
        if (status < 200 || status >= 300) {
          response.resume();
          finish(null, { ...head, body: "" });
          return;
        }
        const declaredLength = Number(response.headers["content-length"] ?? 0);
        if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
          response.resume();
          finish(new Error("The linked page is too large"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          if (settled) return;
          size += chunk.length;
          if (size > options.maxBytes) {
            response.destroy();
            finish(new Error("The linked page is too large"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => finish(null, { ...head, body: Buffer.concat(chunks, size).toString("utf8") }));
        response.on("error", (error) => finish(error));
      },
    );
    request.on("error", (error) => finish(error));
    request.end();
  });
}

/**
 * Fetches a user-supplied public URL with SSRF protection: every hop is resolved,
 * checked against private ranges and connected to by that exact address.
 */
export async function fetchPublicText(value: string, options: {
  maxBytes: number;
  headers?: Record<string, string>;
  /** Redirect hops to follow; 0 rejects redirects. */
  redirects?: number;
}) {
  let target = await resolvePublicUrl(value);
  const maxRedirects = options.redirects ?? 0;
  for (let redirect = 0; ; redirect += 1) {
    const response = await requestPinned(target, { maxBytes: options.maxBytes, headers: options.headers ?? {} });
    if (response.status >= 300 && response.status < 400) {
      if (!response.location) throw new Error("The linked page could not be loaded");
      if (redirect >= maxRedirects) throw new Error(maxRedirects ? "Too many redirects" : "Redirected URLs must be entered directly");
      target = await resolvePublicUrl(new URL(response.location, target.url).toString());
      continue;
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`The linked page returned ${response.status}`);
    return { body: response.body, contentType: response.contentType, finalUrl: target.url.toString() };
  }
}
