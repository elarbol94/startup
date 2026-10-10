import { describe, expect, it } from "vitest";
import { parseControlTag } from "@/modules/wiki/office/docx-extract";
import { parseSectionEditTag, SECTION_EDIT_MAX_AGE_MS, sectionEditTag, sectionRange, staleSectionEdits, type OutlineBlock } from "./section-logic";

// 0–1 intro, 2 H1 A, 3 text, 4 H2 A.1, 5 table, 6 H3 A.1.a, 7 text, 8 H2 A.2, 9 text, 10 H1 B, 11 text
const blocks: OutlineBlock[] = [
  { level: 0 }, { level: 0 },
  { level: 1, title: "A" }, { level: 0 },
  { level: 2, title: "A.1" }, { level: 0 },
  { level: 3, title: "A.1.a" }, { level: 0 },
  { level: 2, title: "A.2" }, { level: 0 },
  { level: 1, title: "B" }, { level: 0 },
];

describe("sectionRange", () => {
  it("runs from the cursor's heading to the next heading of the same or a higher level", () => {
    expect(sectionRange(blocks, 5)).toEqual({ ok: true, range: { start: 4, end: 8, level: 2, title: "A.1" } });
    expect(sectionRange(blocks, 4)).toMatchObject({ range: { start: 4, end: 8 } });
    expect(sectionRange(blocks, 7)).toMatchObject({ range: { start: 6, end: 8, level: 3 } });
    expect(sectionRange(blocks, 3)).toMatchObject({ range: { start: 2, end: 10, level: 1, title: "A" } });
  });

  it("runs to the end of the document after the last heading of its level", () => {
    expect(sectionRange(blocks, 9)).toMatchObject({ range: { start: 8, end: 10 } });
    expect(sectionRange(blocks, 11)).toMatchObject({ range: { start: 10, end: 12, title: "B" } });
  });

  it("treats text above the first heading as the start of the document", () => {
    expect(sectionRange(blocks, 1)).toEqual({ ok: true, range: { start: 0, end: 2, level: 0, title: null } });
    expect(sectionRange([{ level: 0 }, { level: 0 }], 1)).toMatchObject({ range: { start: 0, end: 2, level: 0 } });
  });

  it("ignores levels outside 1–9", () => {
    expect(sectionRange([{ level: 1, title: "A" }, { level: 10 }, { level: 0 }], 2)).toMatchObject({ range: { start: 0, end: 3 } });
  });

  it("refuses an unknown cursor and sections that are already locked", () => {
    expect(sectionRange(blocks, -1)).toEqual({ ok: false, reason: "noPosition" });
    expect(sectionRange(blocks, 12)).toEqual({ ok: false, reason: "noPosition" });
    expect(sectionRange(blocks, Number.NaN)).toEqual({ ok: false, reason: "noPosition" });
    const locked = blocks.map((block, index) => index === 5 ? { level: 0, tag: sectionEditTag({ id: "lock-0001", user: "u1", at: 1 }) } : block);
    expect(sectionRange(locked, 3)).toEqual({ ok: false, reason: "locked" });
    expect(sectionRange(locked, 9)).toMatchObject({ ok: true });
  });
});

describe("section-edit tags", () => {
  it("round-trips the lock", () => {
    const tag = sectionEditTag({ id: "0b0c5a5e-1111-4222-8333-944445555666", user: "u1", at: 1700000000000 });
    expect(tag).toBe('mp:section-edit:{"id":"0b0c5a5e-1111-4222-8333-944445555666","user":"u1","at":1700000000000}');
    expect(parseSectionEditTag(tag)).toEqual({ id: "0b0c5a5e-1111-4222-8333-944445555666", user: "u1", at: 1700000000000 });
  });

  it("are not connections for the stored-version extraction", () => {
    expect(parseControlTag(sectionEditTag({ id: "lock-0001", user: "u1", at: 1 }))).toBeNull();
  });

  it("rejects other tags and malformed data", () => {
    for (const tag of [null, 42, "", "mp:cite:{}", "mp:section-edit:", "mp:section-edit:{", 'mp:section-edit:{"id":"x","user":"u","at":1}',
      'mp:section-edit:{"id":"lock-0001","user":"","at":1}', 'mp:section-edit:{"id":"lock-0001","user":"u","at":"1"}', 'mp:section-edit:{"id":"lock 0001!","user":"u","at":1}']) {
      expect(parseSectionEditTag(tag)).toBeNull();
    }
  });
});

describe("staleSectionEdits", () => {
  const now = 1_700_000_000_000;
  const lock = (id: string, user: string, age = 60_000) => ({ id, user, at: now - age });
  const base = { selfId: "me", liveIds: new Set<string>(), connectedUsers: ["me", "other"] as string[] | null, now };

  it("keeps locks whose editor answers in this browser", () => {
    expect(staleSectionEdits([lock("lock-mine", "me")], { ...base, liveIds: new Set(["lock-mine"]) })).toEqual([]);
  });

  it("releases our own lock without a live editor", () => {
    expect(staleSectionEdits([lock("lock-mine", "me")], base)).toEqual([lock("lock-mine", "me")]);
  });

  it("keeps another user's lock while that user is connected, releases it afterwards", () => {
    expect(staleSectionEdits([lock("lock-other", "other")], base)).toEqual([]);
    expect(staleSectionEdits([lock("lock-other", "other")], { ...base, connectedUsers: ["me"] })).toHaveLength(1);
  });

  it("keeps another user's lock when the connected users are unknown", () => {
    expect(staleSectionEdits([lock("lock-other", "other")], { ...base, connectedUsers: null })).toEqual([]);
  });

  it("releases any lock older than the maximum age unless it is live", () => {
    const old = lock("lock-old", "other", SECTION_EDIT_MAX_AGE_MS + 1);
    expect(staleSectionEdits([old], base)).toEqual([old]);
    expect(staleSectionEdits([old], { ...base, liveIds: new Set(["lock-old"]) })).toEqual([]);
  });
});
