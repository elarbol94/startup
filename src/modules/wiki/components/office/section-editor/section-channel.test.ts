import { describe, expect, it } from "vitest";
import { parseSectionMessage, pickApplyTarget, sectionTabPath, tabGoneDecision } from "./section-channel";
import { isSectionLockId, staleSectionEdits } from "./section-logic";

const id = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";

describe("parseSectionMessage", () => {
  it("accepts every well-formed message", () => {
    expect(parseSectionMessage({ type: "hello", id })).toEqual({ type: "hello", id });
    expect(parseSectionMessage({ type: "open", id, title: null, json: "{}" })).toEqual({ type: "open", id, title: null, json: "{}" });
    expect(parseSectionMessage({ type: "open", id, title: "A.1", json: "{}" })).toMatchObject({ title: "A.1" });
    expect(parseSectionMessage({ type: "who", id, nonce: "n" })).toEqual({ type: "who", id, nonce: "n" });
    expect(parseSectionMessage({ type: "here", id, nonce: "n", tab: "t", owner: false })).toEqual({ type: "here", id, nonce: "n", tab: "t", owner: false });
    expect(parseSectionMessage({ type: "apply", id, tab: "t", json: "{}" })).toEqual({ type: "apply", id, tab: "t", json: "{}" });
    expect(parseSectionMessage({ type: "applied", id, ok: false, reason: "missing" })).toEqual({ type: "applied", id, ok: false, reason: "missing" });
    expect(parseSectionMessage({ type: "applied", id, ok: true, reason: undefined })).toEqual({ type: "applied", id, ok: true });
    expect(parseSectionMessage({ type: "discard", id })).toEqual({ type: "discard", id });
    expect(parseSectionMessage({ type: "closed", id })).toEqual({ type: "closed", id });
    expect(parseSectionMessage({ type: "mainReady", extra: 1 })).toEqual({ type: "mainReady" });
    expect(parseSectionMessage({ type: "ping", nonce: "n" })).toEqual({ type: "ping", nonce: "n" });
    expect(parseSectionMessage({ type: "pong", nonce: "n", id })).toEqual({ type: "pong", nonce: "n", id });
  });

  it("rejects malformed messages", () => {
    for (const data of [null, "hello", 1, {}, { type: "nope", id }, { type: "hello" }, { type: "hello", id: "" }, { type: "hello", id: "x".repeat(201) },
      { type: "open", id, json: "{}" }, { type: "open", id, title: 1, json: "{}" }, { type: "open", id, title: null },
      { type: "here", id, nonce: "n", tab: "t" }, { type: "apply", id, json: "{}" }, { type: "applied", id }, { type: "who", id }]) {
      expect(parseSectionMessage(data)).toBeNull();
    }
  });
});

describe("pickApplyTarget", () => {
  it("prefers the tab that opened the section, else the first answer", () => {
    expect(pickApplyTarget([{ tab: "a", owner: false }, { tab: "b", owner: true }])).toBe("b");
    expect(pickApplyTarget([{ tab: "a", owner: false }, { tab: "c", owner: false }])).toBe("a");
    expect(pickApplyTarget([])).toBeNull();
  });
});

describe("tabGoneDecision", () => {
  it("releases the lock only for the open session when the tab did not come back", () => {
    expect(tabGoneDecision({ sessionId: id, lockId: id, reconnected: false })).toBe("release");
    expect(tabGoneDecision({ sessionId: id, lockId: id, reconnected: true })).toBe("keep");
    expect(tabGoneDecision({ sessionId: null, lockId: id, reconnected: false })).toBe("ignore");
    expect(tabGoneDecision({ sessionId: "other-session", lockId: id, reconnected: false })).toBe("ignore");
  });
});

describe("section tab", () => {
  it("puts only the lock id into the URL", () => {
    expect(sectionTabPath("Mein Bericht", id)).toBe(`/wiki/pages/Mein%20Bericht/section?edit=${id}`);
  });

  it("accepts only lock ids as ?edit=", () => {
    expect(isSectionLockId(id)).toBe(true);
    for (const value of [undefined, "", "short", "../../x", `${id}<`, "a".repeat(65)]) expect(isSectionLockId(value)).toBe(false);
  });

  it("keeps a lock live while its section tab answers in this browser", () => {
    const lock = { id, user: "u1", at: 1000 };
    const context = { selfId: "u1", connectedUsers: ["u1"], now: 2000 };
    expect(staleSectionEdits([lock], { ...context, liveIds: new Set([id]) })).toEqual([]);
    // The section tab is closed (or shows "not available"): our own lock is a leftover.
    expect(staleSectionEdits([lock], { ...context, liveIds: new Set() })).toEqual([lock]);
  });
});
