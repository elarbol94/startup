// Minimal CalDAV client for the configured Nextcloud (NEXTCLOUD_URL): discovery,
// calendar listing, RFC 6578 sync, multiget, PUT/DELETE with ETags, MKCALENDAR.
// Used by caldav-sync.ts and caldav-actions.ts.
import "server-only";

import { DOMParser, type Element } from "@xmldom/xmldom";
import { nextcloudUrl } from "@/modules/cloud/config";

const DAV = "DAV:";
const CALDAV = "urn:ietf:params:xml:ns:caldav";
const APPLE = "http://apple.com/ns/ical/";
const TIMEOUT_MS = 20_000;
const MULTIGET_BATCH = 100;

export type CaldavAuth = { username: string; password: string };

export const caldavErrorCodes = ["auth_failed", "not_found", "conflict", "invalid_token", "unreachable", "bad_response"] as const;
export type CaldavErrorCode = (typeof caldavErrorCodes)[number];

export class CaldavError extends Error {
  constructor(readonly code: CaldavErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
  }
}

export type RemoteCalendar = { url: string; name: string; color: string | null; writable: boolean };

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Only URLs on the configured Nextcloud are ever requested, so stored or returned hrefs cannot point elsewhere. */
export function resolveDavUrl(href: string, base = nextcloudUrl()) {
  const origin = new URL(base).origin;
  const url = new URL(href, `${origin}/`);
  if (url.origin !== origin) throw new CaldavError("bad_response", "foreign href");
  return url.toString();
}

async function dav(
  url: string,
  auth: CaldavAuth,
  options: { method: string; depth?: "0" | "1"; body?: string; headers?: Record<string, string> },
) {
  const headers: Record<string, string> = {
    authorization: `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString("base64")}`,
    ...options.headers,
  };
  if (options.depth) headers.depth = options.depth;
  if (options.body && !headers["content-type"]) headers["content-type"] = "application/xml; charset=utf-8";
  let response: Response;
  try {
    response = await fetch(resolveDavUrl(url), {
      method: options.method,
      headers,
      body: options.body,
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new CaldavError("unreachable", error instanceof Error ? error.message : undefined);
  }
  if (response.status === 401) throw new CaldavError("auth_failed");
  if (response.status === 404 || response.status === 410) throw new CaldavError("not_found");
  if (response.status === 412) throw new CaldavError("conflict");
  return response;
}

type DavResponse = { href: string; status: number; prop: (ns: string, name: string) => Element | null };

function decodeHref(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function statusCode(line: string | null | undefined) {
  return Number(/\s(\d{3})\s?/.exec(line ?? "")?.[1] ?? 0);
}

function children(parent: Element, ns: string, name: string) {
  return Array.from(parent.getElementsByTagNameNS(ns, name));
}

/** Parses a 207 multistatus; `prop` only returns properties from a 200 propstat. */
export function parseMultistatus(xml: string): { responses: DavResponse[]; syncToken: string | null } {
  let root: Element | null;
  try {
    root = new DOMParser().parseFromString(xml, "text/xml").documentElement;
  } catch {
    throw new CaldavError("bad_response", "invalid XML");
  }
  if (!root || root.namespaceURI !== DAV || root.localName !== "multistatus") throw new CaldavError("bad_response", "no multistatus");
  const responses = Array.from(root.childNodes)
    .filter((node): node is Element => node.nodeType === 1 && (node as Element).localName === "response")
    .map((response) => {
      const okProps = children(response, DAV, "propstat")
        .filter((propstat) => statusCode(children(propstat, DAV, "status")[0]?.textContent) === 200)
        .flatMap((propstat) => children(propstat, DAV, "prop"));
      const direct = Array.from(response.childNodes).find((node) => node.nodeType === 1 && (node as Element).localName === "status");
      return {
        href: decodeHref(children(response, DAV, "href")[0]?.textContent?.trim() ?? ""),
        status: direct ? statusCode(direct.textContent) : 200,
        prop: (ns: string, name: string) => okProps.map((prop) => children(prop, ns, name)[0]).find(Boolean) ?? null,
      };
    });
  const token = Array.from(root.childNodes).find((node) => node.nodeType === 1 && (node as Element).localName === "sync-token");
  return { responses, syncToken: token?.textContent?.trim() || null };
}

async function multistatus(response: Response) {
  if (response.status !== 207) throw new CaldavError("bad_response", `status ${response.status}`);
  return parseMultistatus(await response.text());
}

const propfind = (props: string) =>
  `<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="${CALDAV}" xmlns:a="${APPLE}"><d:prop>${props}</d:prop></d:propfind>`;

/** Finds the calendar home through the principal; also proves the login works. */
export async function discoverCalendarHome(auth: CaldavAuth) {
  const root = await multistatus(await dav(`${nextcloudUrl()}/remote.php/dav/`, auth, {
    method: "PROPFIND", depth: "0", body: propfind("<d:current-user-principal/>"),
  }));
  const principal = root.responses[0]?.prop(DAV, "current-user-principal");
  const principalHref = principal && children(principal, DAV, "href")[0]?.textContent?.trim();
  if (!principalHref) throw new CaldavError("bad_response", "no principal");
  const home = await multistatus(await dav(principalHref, auth, {
    method: "PROPFIND", depth: "0", body: propfind("<c:calendar-home-set/>"),
  }));
  const set = home.responses[0]?.prop(CALDAV, "calendar-home-set");
  const homeHref = set && children(set, DAV, "href")[0]?.textContent?.trim();
  if (!homeHref) throw new CaldavError("bad_response", "no calendar home");
  return resolveDavUrl(homeHref);
}

export async function listRemoteCalendars(homeUrl: string, auth: CaldavAuth): Promise<RemoteCalendar[]> {
  const result = await multistatus(await dav(homeUrl, auth, {
    method: "PROPFIND",
    depth: "1",
    body: propfind("<d:displayname/><d:resourcetype/><d:current-user-privilege-set/><c:supported-calendar-component-set/><a:calendar-color/>"),
  }));
  return result.responses.flatMap((response) => {
    const type = response.prop(DAV, "resourcetype");
    if (!type || children(type, CALDAV, "calendar").length === 0) return [];
    const components = response.prop(CALDAV, "supported-calendar-component-set");
    if (components && !children(components, CALDAV, "comp").some((comp) => comp.getAttribute("name") === "VEVENT")) return [];
    const privileges = response.prop(DAV, "current-user-privilege-set");
    const writable = !privileges || ["all", "write", "write-content"].some((name) => children(privileges, DAV, name).length > 0);
    const url = resolveDavUrl(response.href);
    return [{
      url,
      name: response.prop(DAV, "displayname")?.textContent?.trim() || decodeHref(url.split("/").filter(Boolean).at(-1) ?? ""),
      color: /^#[0-9a-f]{6}/i.exec(response.prop(APPLE, "calendar-color")?.textContent?.trim() ?? "")?.[0] ?? null,
      writable,
    }];
  });
}

export type SyncChanges = { syncToken: string | null; changed: { url: string; etag: string | null }[]; removed: string[] };

/**
 * RFC 6578 sync: with a token only changes since then, without one every object.
 * shortcut: no paging for truncated (507) results; Nextcloud returns the full set, add it if a server truncates.
 */
export async function syncCollection(collectionUrl: string, token: string | null, auth: CaldavAuth): Promise<SyncChanges> {
  const body = `<?xml version="1.0" encoding="utf-8"?><d:sync-collection xmlns:d="DAV:"><d:sync-token>${escapeXml(token ?? "")}</d:sync-token><d:sync-level>1</d:sync-level><d:prop><d:getetag/></d:prop></d:sync-collection>`;
  const response = await dav(collectionUrl, auth, { method: "REPORT", depth: "1", body });
  if (response.status === 403 || response.status === 409) throw new CaldavError("invalid_token");
  const result = await multistatus(response);
  const self = decodeHref(new URL(collectionUrl).pathname);
  const changes: SyncChanges = { syncToken: result.syncToken, changed: [], removed: [] };
  for (const entry of result.responses) {
    if (!entry.href || entry.href === self || entry.href.endsWith("/")) continue;
    const url = resolveDavUrl(entry.href);
    if (entry.status === 404) changes.removed.push(url);
    else changes.changed.push({ url, etag: entry.prop(DAV, "getetag")?.textContent?.trim() || null });
  }
  return changes;
}

export async function multigetObjects(collectionUrl: string, urls: string[], auth: CaldavAuth) {
  const objects: { url: string; etag: string | null; data: string }[] = [];
  for (let index = 0; index < urls.length; index += MULTIGET_BATCH) {
    const hrefs = urls.slice(index, index + MULTIGET_BATCH).map((url) => `<d:href>${escapeXml(new URL(url).pathname)}</d:href>`).join("");
    const body = `<?xml version="1.0" encoding="utf-8"?><c:calendar-multiget xmlns:d="DAV:" xmlns:c="${CALDAV}"><d:prop><d:getetag/><c:calendar-data/></d:prop>${hrefs}</c:calendar-multiget>`;
    const result = await multistatus(await dav(collectionUrl, auth, { method: "REPORT", depth: "1", body }));
    for (const entry of result.responses) {
      const data = entry.prop(CALDAV, "calendar-data")?.textContent;
      if (entry.status === 200 && data) {
        objects.push({ url: resolveDavUrl(entry.href), etag: entry.prop(DAV, "getetag")?.textContent?.trim() || null, data });
      }
    }
  }
  return objects;
}

/** Creates (`etag: null`) or replaces (`If-Match`) an object; returns the new ETag when the server sends one. */
export async function putObject(url: string, ics: string, etag: string | null, auth: CaldavAuth) {
  const response = await dav(url, auth, {
    method: "PUT",
    body: ics,
    headers: { "content-type": "text/calendar; charset=utf-8", ...(etag ? { "if-match": etag } : { "if-none-match": "*" }) },
  });
  if (response.status !== 201 && response.status !== 204 && response.status !== 200) {
    throw new CaldavError("bad_response", `PUT ${response.status}`);
  }
  return response.headers.get("etag");
}

export async function deleteObject(url: string, etag: string | null, auth: CaldavAuth) {
  try {
    const response = await dav(url, auth, { method: "DELETE", headers: etag ? { "if-match": etag } : {} });
    if (response.status >= 300) throw new CaldavError("bad_response", `DELETE ${response.status}`);
  } catch (error) {
    if (error instanceof CaldavError && error.code === "not_found") return;
    throw error;
  }
}

export async function makeCalendar(homeUrl: string, name: string, color: string, auth: CaldavAuth) {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "calendar";
  const url = resolveDavUrl(`${new URL(homeUrl).pathname.replace(/\/?$/, "/")}${slug}-${crypto.randomUUID().slice(0, 8)}/`);
  const body = `<?xml version="1.0" encoding="utf-8"?><c:mkcalendar xmlns:d="DAV:" xmlns:c="${CALDAV}" xmlns:a="${APPLE}"><d:set><d:prop><d:displayname>${escapeXml(name)}</d:displayname><a:calendar-color>${escapeXml(color)}</a:calendar-color><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set></d:prop></d:set></c:mkcalendar>`;
  const response = await dav(url, auth, { method: "MKCALENDAR", body });
  if (response.status !== 201) throw new CaldavError("bad_response", `MKCALENDAR ${response.status}`);
  return url;
}
