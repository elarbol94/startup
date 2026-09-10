import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { CollaborationProvider } from "./provider";
import { decode, encode } from "./codec";

const storage = new Map<string, string>();
const providers: CollaborationProvider[] = [];
let server: Y.Doc;
let account = "alice";
let loseResponse = false;
let denied = false;
let hold: (() => void) | undefined;
const provider = () => { const result = new CollaborationProvider("page", "shared"); providers.push(result); return result; };
beforeEach(() => {
  account = "alice"; storage.clear(); server = new Y.Doc(); server.getText("text").insert(0, "Hello"); loseResponse = false; denied = false; hold = undefined;
  vi.stubGlobal("localStorage", { get length() { return storage.size; }, key: (index: number) => [...storage.keys()][index] ?? null, getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  vi.stubGlobal("EventSource", class { addEventListener() {} close() {} });
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options?: RequestInit) => {
    if (denied) return Response.json({}, { status: 403 });
    if (options?.method === "POST") {
      const body = JSON.parse(String(options.body));
      if (body.update) Y.applyUpdate(server, decode(body.update));
      if (hold) await new Promise<void>(resolve => { hold = resolve; });
      if (loseResponse) { loseResponse = false; throw new Error("lost response"); }
    }
    return Response.json({ update: encode(Y.encodeStateAsUpdate(server)), sequence: 1, user: { id: account, name: account } });
  }));
});
afterEach(() => { providers.splice(0).forEach(provider => provider.stop()); server.destroy(); vi.unstubAllGlobals(); });
it("keeps edits made during a save pending until both are acknowledged", async () => {
  const client = provider(); await client.start();
  hold = () => {};
  client.doc.getText("text").insert(5, " first");
  client.doc.getText("text").insert(11, " second");
  expect(client.status).toBe("saving"); expect(storage.size).toBe(1);
  const release = hold!; hold = undefined; release();
  expect(await client.flush()).toBe(true);
  expect(server.getText("text").toString()).toBe("Hello first second"); expect(storage.size).toBe(0);
});
it("recovers a lost acknowledgement after closing and reopening without duplicating text", async () => {
  const client = provider(); await client.start(); loseResponse = true;
  client.doc.getText("text").insert(5, " retained");
  expect(await client.flush()).toBe(false); expect(storage.size).toBe(1); client.stop();
  const reopened = provider(); await reopened.start();
  expect(reopened.doc.getText("text").toString()).toBe("Hello retained");
  expect(server.getText("text").toString()).toBe("Hello retained"); expect(storage.size).toBe(0);
});
it("does not let another tab's acknowledgement erase an offline journal", async () => {
  const first = provider(), second = provider(); await first.start(); await second.start();
  loseResponse = true; first.doc.getText("text").insert(5, " offline"); await first.flush();
  const key = [...storage.keys()][0];
  expect(await second.flush()).toBe(true); expect(storage.has(key)).toBe(true);
});
it("retains local changes when access is removed and refuses further writes", async () => {
  const client = provider(); await client.start(); denied = true;
  client.doc.getText("text").insert(5, " pending");
  expect(await client.flush()).toBe(false); expect(client.status).toBe("denied"); expect(storage.size).toBe(1);
  expect(server.getText("text").toString()).toBe("Hello");
});

it("does not clear an access denial when an earlier acknowledgement arrives", async () => {
  const client = provider(); await client.start(); hold = () => {};
  client.doc.getText("text").insert(5, " accepted earlier");
  client.status = "denied";
  const release = hold!; hold = undefined; release();
  await client.flush();
  expect(client.status).toBe("denied");
  client.doc.getText("text").insert(0, "blocked ");
  expect(await client.flush()).toBe(false);
  expect(server.getText("text").toString()).not.toContain("blocked");
});

it("does not recover another account's pending content", async () => {
  const alice = provider(); await alice.start(); denied = true;
  alice.doc.getText("text").insert(5, " private pending"); await alice.flush(); alice.stop();
  account = "bob"; denied = false;
  const bob = provider(); await bob.start();
  expect(bob.doc.getText("text").toString()).toBe("Hello");
  expect(storage.size).toBe(1);
});
