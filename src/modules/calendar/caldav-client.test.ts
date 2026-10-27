import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.NEXTCLOUD_URL = "https://cloud.example.com";

import { listRemoteCalendars, resolveDavUrl, syncCollection } from "./caldav-client";

const auth = { username: "owner", password: "secret" };
const reply = (body: string, status = 207) => vi.fn(async () => new Response(body, { status }));

afterEach(() => vi.unstubAllGlobals());

describe("caldav-client", () => {
  it("refuses hrefs outside the configured Nextcloud", () => {
    expect(resolveDavUrl("/remote.php/dav/calendars/owner/")).toBe("https://cloud.example.com/remote.php/dav/calendars/owner/");
    expect(() => resolveDavUrl("https://evil.example.net/x")).toThrow(/bad_response/);
  });

  it("lists writable event calendars and skips task lists and the trash bin", async () => {
    const fetch = reply(`<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav" xmlns:x1="http://apple.com/ns/ical/">
 <d:response><d:href>/remote.php/dav/calendars/owner/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>/remote.php/dav/calendars/owner/personal/</d:href><d:propstat><d:prop>
   <d:displayname>Persönlich</d:displayname><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>
   <cal:supported-calendar-component-set><cal:comp name="VEVENT"/></cal:supported-calendar-component-set>
   <x1:calendar-color>#0082C9FF</x1:calendar-color>
   <d:current-user-privilege-set><d:privilege><d:all/></d:privilege></d:current-user-privilege-set>
 </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>/remote.php/dav/calendars/owner/tasks/</d:href><d:propstat><d:prop>
   <d:displayname>Tasks</d:displayname><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>
   <cal:supported-calendar-component-set><cal:comp name="VTODO"/></cal:supported-calendar-component-set>
 </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>/remote.php/dav/calendars/owner/shared_by_anna/</d:href><d:propstat><d:prop>
   <d:displayname>Anna</d:displayname><d:resourcetype><d:collection/><cal:calendar/></d:resourcetype>
   <d:current-user-privilege-set><d:privilege><d:read/></d:privilege></d:current-user-privilege-set>
 </d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>/remote.php/dav/calendars/owner/trashbin/</d:href><d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
</d:multistatus>`);
    vi.stubGlobal("fetch", fetch);
    expect(await listRemoteCalendars("https://cloud.example.com/remote.php/dav/calendars/owner/", auth)).toEqual([
      { url: "https://cloud.example.com/remote.php/dav/calendars/owner/personal/", name: "Persönlich", color: "#0082C9", writable: true },
      { url: "https://cloud.example.com/remote.php/dav/calendars/owner/shared_by_anna/", name: "Anna", color: null, writable: false },
    ]);
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("PROPFIND");
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("owner:secret").toString("base64")}`);
  });

  it("reads changed and removed objects and the new token from a sync report", async () => {
    vi.stubGlobal("fetch", reply(`<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
 <d:response><d:href>/remote.php/dav/calendars/owner/personal/a%20b.ics</d:href><d:propstat><d:prop><d:getetag>"abc"</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>
 <d:response><d:href>/remote.php/dav/calendars/owner/personal/gone.ics</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>
 <d:sync-token>http://sabre.io/ns/sync/42</d:sync-token>
</d:multistatus>`));
    expect(await syncCollection("https://cloud.example.com/remote.php/dav/calendars/owner/personal/", "http://sabre.io/ns/sync/41", auth)).toEqual({
      syncToken: "http://sabre.io/ns/sync/42",
      changed: [{ url: "https://cloud.example.com/remote.php/dav/calendars/owner/personal/a%20b.ics", etag: '"abc"' }],
      removed: ["https://cloud.example.com/remote.php/dav/calendars/owner/personal/gone.ics"],
    });
  });

  it("maps an expired sync token to invalid_token", async () => {
    vi.stubGlobal("fetch", reply("", 403));
    await expect(syncCollection("https://cloud.example.com/remote.php/dav/calendars/owner/personal/", "old", auth)).rejects.toThrow(/invalid_token/);
  });
});
