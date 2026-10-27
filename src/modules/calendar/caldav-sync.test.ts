import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { default: Database } = await import("better-sqlite3");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "drizzle" });
  return { db, sqlite };
});

process.env.BETTER_AUTH_SECRET = "test-secret-for-caldav";
process.env.NEXTCLOUD_URL = "https://cloud.example.com";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  calendarCaldavAccounts,
  calendarCaldavLinks,
  calendarCaldavObjects,
  calendarEvents,
  calendars,
  user,
} from "@/db/schema";
import { encryptSecret } from "@/modules/mail/crypto";
import { CaldavError } from "./caldav-client";
import { syncCaldavCalendar, type CaldavApi } from "./caldav-sync";

const COLLECTION = "https://cloud.example.com/remote.php/dav/calendars/owner/work/";

/** In-memory Nextcloud collection with RFC 6578 change tracking. */
function fakeServer() {
  let version = 0;
  const objects = new Map<string, { etag: string; data: string; version: number }>();
  const deletions = new Map<string, number>();
  const calls: string[] = [];
  const write = (url: string, data: string) => {
    version += 1;
    const etag = `"e${version}"`;
    objects.set(url, { etag, data, version });
    deletions.delete(url);
    return etag;
  };
  const api: CaldavApi = {
    async syncCollection(_collection, token) {
      calls.push(`sync ${token ?? "-"}`);
      if (token === "stale") throw new CaldavError("invalid_token");
      const since = token ? Number(token) : -1;
      return {
        syncToken: String(version),
        changed: [...objects].filter(([, object]) => object.version > since).map(([url, object]) => ({ url, etag: object.etag })),
        removed: token ? [...deletions].filter(([, at]) => at > since).map(([url]) => url) : [],
      };
    },
    async multigetObjects(_collection, urls) {
      calls.push(`multiget ${urls.length}`);
      return urls.flatMap((url) => (objects.has(url) ? [{ url, etag: objects.get(url)!.etag, data: objects.get(url)!.data }] : []));
    },
    async putObject(url, ics, etag) {
      calls.push(`put ${url.split("/").at(-1)}`);
      const current = objects.get(url);
      if (etag ? current?.etag !== etag : current) throw new CaldavError("conflict");
      return write(url, ics);
    },
    async deleteObject(url, etag) {
      calls.push(`delete ${url.split("/").at(-1)}`);
      if (etag && objects.get(url)?.etag !== etag) throw new CaldavError("conflict");
      version += 1;
      objects.delete(url);
      deletions.set(url, version);
    },
  };
  return { api, objects, calls, write, remove: (url: string) => api.deleteObject(url, null, { username: "", password: "" }) };
}

const remoteIcs = (uid: string, summary: string) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", `UID:${uid}`, "DTSTART:20261105T090000Z", "DTEND:20261105T100000Z", `SUMMARY:${summary}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");

const events = () => db.select().from(calendarEvents).where(eq(calendarEvents.calendarId, "linked")).all();
const later = (ms = 1_000) => new Date(Date.now() + ms);

let server: ReturnType<typeof fakeServer>;

beforeAll(() => {
  const now = new Date();
  db.insert(user).values({ id: "owner", name: "Owner", email: "owner@example.com", createdAt: now, updatedAt: now }).run();
  db.insert(calendarCaldavAccounts).values({
    userId: "owner", username: "owner", passwordEncrypted: encryptSecret("app-password"), homeUrl: "https://cloud.example.com/remote.php/dav/calendars/owner/",
  }).run();
});

beforeEach(() => {
  db.delete(calendars).run();
  db.insert(calendars).values({ id: "linked", ownerId: "owner", name: "Work" }).run();
  db.insert(calendarCaldavLinks).values({ calendarId: "linked", userId: "owner", collectionUrl: COLLECTION }).run();
  server = fakeServer();
});

describe("syncCaldavCalendar", () => {
  it("pulls remote events and pushes local ones, then settles", async () => {
    server.write(`${COLLECTION}remote.ics`, remoteIcs("remote-1", "Aus Nextcloud"));
    db.insert(calendarEvents).values({
      id: "local1", calendarId: "linked", title: "Aus der App", startAt: new Date("2026-11-06T08:00:00Z"), endAt: new Date("2026-11-06T09:00:00Z"), createdBy: "owner",
    }).run();

    expect(await syncCaldavCalendar("linked", server.api)).toEqual({ ok: true, pulled: 1, pushed: 1, deleted: 0 });
    expect(events().map((event) => event.title).sort()).toEqual(["Aus Nextcloud", "Aus der App"]);
    const pushed = server.objects.get(`${COLLECTION}local1.ics`)!;
    expect(pushed.data).toContain("UID:local1@management-platform");
    expect(pushed.data).toContain("SUMMARY:Aus der App");

    server.calls.length = 0;
    expect(await syncCaldavCalendar("linked", server.api)).toEqual({ ok: true, pulled: 0, pushed: 0, deleted: 0 });
    expect(server.calls).toEqual([expect.stringMatching(/^sync \d+$/)]);
  });

  it("carries edits and deletions in both directions", async () => {
    server.write(`${COLLECTION}a.ics`, remoteIcs("a", "A"));
    server.write(`${COLLECTION}b.ics`, remoteIcs("b", "B"));
    await syncCaldavCalendar("linked", server.api);
    const [a, b] = ["a", "b"].map((uid) => events().find((event) => event.externalUid === uid)!);

    db.update(calendarEvents).set({ title: "A lokal", updatedAt: later() }).where(eq(calendarEvents.id, a.id)).run();
    db.update(calendarEvents).set({ status: "cancelled", updatedAt: later() }).where(eq(calendarEvents.id, b.id)).run();
    await syncCaldavCalendar("linked", server.api);
    expect(server.objects.get(`${COLLECTION}a.ics`)!.data).toContain("SUMMARY:A lokal");
    expect(server.objects.has(`${COLLECTION}b.ics`)).toBe(false);

    server.write(`${COLLECTION}a.ics`, remoteIcs("a", "A remote"));
    await syncCaldavCalendar("linked", server.api);
    expect(events().find((event) => event.id === a.id)?.title).toBe("A remote");

    await server.remove(`${COLLECTION}a.ics`);
    await syncCaldavCalendar("linked", server.api);
    expect(events().some((event) => event.id === a.id)).toBe(false);
    expect(db.select().from(calendarCaldavObjects).all()).toEqual([]);
  });

  it("lets Nextcloud win when both sides changed the same event", async () => {
    server.write(`${COLLECTION}c.ics`, remoteIcs("c", "C"));
    await syncCaldavCalendar("linked", server.api);
    const c = events()[0];
    db.update(calendarEvents).set({ title: "C lokal", updatedAt: later() }).where(eq(calendarEvents.id, c.id)).run();
    server.write(`${COLLECTION}c.ics`, remoteIcs("c", "C remote"));

    expect(await syncCaldavCalendar("linked", server.api)).toMatchObject({ ok: true, pushed: 0 });
    expect(events()[0].title).toBe("C remote");
    expect(server.objects.get(`${COLLECTION}c.ics`)!.data).toContain("SUMMARY:C remote");
  });

  it("relists everything after an invalid sync token and drops vanished objects", async () => {
    server.write(`${COLLECTION}d.ics`, remoteIcs("d", "D"));
    server.write(`${COLLECTION}e.ics`, remoteIcs("e", "E"));
    await syncCaldavCalendar("linked", server.api);
    server.objects.delete(`${COLLECTION}e.ics`); // deleted while our token was unusable
    db.update(calendarCaldavLinks).set({ syncToken: "stale" }).run();

    expect(await syncCaldavCalendar("linked", server.api)).toMatchObject({ ok: true });
    expect(server.calls).toContain("sync -");
    expect(events().map((event) => event.externalUid)).toEqual(["d"]);
  });

  it("records the error code and keeps the data when the login fails", async () => {
    server.write(`${COLLECTION}f.ics`, remoteIcs("f", "F"));
    await syncCaldavCalendar("linked", server.api);
    const failing: CaldavApi = { ...server.api, syncCollection: async () => { throw new CaldavError("auth_failed"); } };

    expect(await syncCaldavCalendar("linked", failing)).toEqual({ ok: false, error: "auth_failed" });
    expect(db.select().from(calendarCaldavLinks).get()?.lastError).toBe("auth_failed");
    expect(events()).toHaveLength(1);
  });
});
