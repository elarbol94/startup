import { beforeAll, describe, expect, it, vi } from "vitest";

// The scratch branch must answer before any database access.
vi.mock("@/db", () => ({ db: new Proxy({}, { get: () => { throw new Error("database used"); } }) }));
vi.mock("../lib/vector-store.server", () => ({ indexText: vi.fn(async () => {}), removeFromIndex: vi.fn() }));

import { handleCallback, type CallbackPayload } from "./callback";
import { buildScratchEditorConfig } from "./editor-config";
import { isScratchKey, newScratchKey } from "./scratch";
import { signFileToken, signJwt, signScratchToken, verifyFileToken, verifyScratchToken } from "./tokens";
import type { OfficeConfig } from "./config";

beforeAll(() => { process.env.BETTER_AUTH_SECRET = "test-secret-with-enough-length-0123456789"; });

const config: OfficeConfig = { publicPath: "/office", internalUrl: "http://onlyoffice", appInternalUrl: "http://app:3000", inboxSecret: "i".repeat(40), outboxSecret: "o".repeat(40) };

describe("scratch keys", () => {
  it("are fresh, valid document keys that no page session can produce", () => {
    const key = newScratchKey();
    expect(key).toMatch(/^scratch-[0-9a-f-]{36}$/);
    expect(key.length).toBeLessThanOrEqual(128);
    expect(newScratchKey()).not.toBe(key);
    expect(isScratchKey(key)).toBe(true);
    for (const other of ["scratch-", "scratch-x", `${key}-1`, `page-${key}`, "0b0c5a5e-1111-4222-8333-944445555666-AbCdEf", ""]) expect(isScratchKey(other)).toBe(false);
  });
});

describe("scratch tokens", () => {
  it("bind the key and locale and are not interchangeable with file tokens", () => {
    const key = newScratchKey();
    expect(verifyScratchToken(signScratchToken({ key, locale: "en" }))).toMatchObject({ typ: "scratch", key, locale: "en" });
    expect(() => verifyScratchToken(signScratchToken({ key, locale: "de" }, -10))).toThrow(/expired/);
    expect(() => verifyScratchToken(signFileToken({ res: "docx", pageId: "p1", versionId: "v1", attachmentId: "a1" }))).toThrow();
    expect(() => verifyFileToken(signScratchToken({ key, locale: "de" }))).toThrow();
    expect(() => verifyScratchToken(signJwt({ typ: "scratch", key, locale: "de", exp: Math.floor(Date.now() / 1000) + 60 }, config.inboxSecret))).toThrow();
    expect(() => verifyScratchToken(signScratchToken({ key: "scratch-../../etc", locale: "de" }))).toThrow();
  });
});

describe("scratch editor config", () => {
  it("serves the blank document and discards callbacks", () => {
    const scratchKey = newScratchKey();
    const editor = buildScratchEditorConfig({
      config, page: { id: "p1", title: "Plan" }, user: { id: "u1", name: "User" }, locale: "de", theme: "light", origin: "https://app.example", scratchKey,
      plugin: { pageId: "p1", bridgeId: "b1", mode: "section" },
    });
    expect(editor.document.key).toBe(scratchKey);
    expect(editor.document.url).toMatch(/^http:\/\/app:3000\/api\/wiki\/office\/scratch\?token=/);
    expect(verifyScratchToken(decodeURIComponent(editor.document.url.split("token=")[1]))).toMatchObject({ key: scratchKey, locale: "de" });
    expect(editor.editorConfig.callbackUrl).toBe("http://app:3000/api/wiki/office/callback?scratch=1");
    expect(editor.document.permissions).toMatchObject({ edit: true, review: false });
    expect(editor.editorConfig.customization.forcesave).toBe(false);
    expect(editor.editorConfig.plugins.options.all).toMatchObject({ mode: "section" });
  });
});

describe("scratch callbacks", () => {
  const deps = { download: vi.fn(async () => { throw new Error("downloaded"); }) };

  it("are accepted and discarded without storage", async () => {
    for (const status of [1, 2, 4, 6]) {
      const payload: CallbackPayload = { key: newScratchKey(), status, url: "http://onlyoffice/cache/files/x/output.docx", users: ["u1"] };
      await expect(handleCallback("", payload, deps)).resolves.toEqual({ ok: true, discarded: true });
    }
    expect(deps.download).not.toHaveBeenCalled();
  });

  it("still handle page keys normally", async () => {
    await expect(handleCallback("p1", { key: "p1-AbCdEf", status: 1 }, deps)).rejects.toThrow("database used");
  });
});
