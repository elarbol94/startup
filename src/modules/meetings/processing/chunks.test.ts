import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { keySegments, planChunks, referenceClips } from "./chunks";
import { buildTranscriptBlock, normalizeProtocol } from "./protocol-ai";

describe("planChunks", () => {
  it("keeps short recordings whole", () => {
    expect(planChunks(5 * 60_000, [], 20 * 60_000)).toEqual([{ startMs: 0, durationMs: 5 * 60_000 }]);
  });

  it("cuts at the last silence in the second half of each window, without overlap", () => {
    const chunks = planChunks(50 * 60_000, [5 * 60_000, 15 * 60_000, 18 * 60_000, 33 * 60_000], 20 * 60_000);
    expect(chunks).toEqual([
      { startMs: 0, durationMs: 18 * 60_000 },
      { startMs: 18 * 60_000, durationMs: 15 * 60_000 },
      { startMs: 33 * 60_000, durationMs: 17 * 60_000 },
    ]);
    expect(chunks.reduce((sum, chunk) => sum + chunk.durationMs, 0)).toBe(50 * 60_000);
  });

  it("falls back to a hard cut without a usable silence", () => {
    expect(planChunks(30 * 60_000, [60_000], 20 * 60_000)).toEqual([
      { startMs: 0, durationMs: 20 * 60_000 },
      { startMs: 20 * 60_000, durationMs: 10 * 60_000 },
    ]);
  });
});

describe("speaker keys across chunks", () => {
  it("names first-chunk speakers SPK1… and offsets timestamps", () => {
    const keyed = keySegments(0, { startMs: 0, durationMs: 60_000 }, [
      { startMs: 0, endMs: 3000, speaker: "A", text: "Hallo" },
      { startMs: 3000, endMs: 9000, speaker: "B", text: "Servus zusammen" },
      { startMs: 9000, endMs: 9500, speaker: "A", text: " " },
    ], []);
    expect(keyed.map((segment) => segment.speakerKey)).toEqual(["SPK1", "SPK2"]);
    const later = keySegments(1, { startMs: 60_000, durationMs: 60_000 }, [
      { startMs: 1000, endMs: 2000, speaker: "SPK2", text: "Weiter" },
      { startMs: 2000, endMs: 3000, speaker: "C", text: "Neu dabei" },
    ], ["SPK1", "SPK2"]);
    expect(later).toEqual([
      { startMs: 61_000, endMs: 62_000, speakerKey: "SPK2", text: "Weiter" },
      { startMs: 62_000, endMs: 63_000, speakerKey: "c2:C", text: "Neu dabei" },
    ]);
  });

  it("uses each known speaker's longest segment of at least two seconds as reference", () => {
    const clips = referenceClips([
      { startMs: 0, endMs: 1500, speakerKey: "SPK1", text: "x" },
      { startMs: 2000, endMs: 30_000, speakerKey: "SPK1", text: "x" },
      { startMs: 0, endMs: 1000, speakerKey: "SPK2", text: "x" },
      { startMs: 0, endMs: 5000, speakerKey: "c2:A", text: "x" },
    ]);
    expect(clips).toEqual([{ name: "SPK1", startMs: 2000, durationMs: 10_000 }]);
  });
});

describe("protocol normalisation", () => {
  const input = {
    meetingId: "m", title: "T", language: "de", agenda: "", safetyIdentifier: "x", previousActionItems: [],
    participants: [{ id: "u1", name: "Anna" }], speakers: { "r1:SPK1": "Anna" },
    segments: [
      { id: "seg-a", startMs: 0, speakerKey: "r1:SPK1", text: "Wir reichen ein." },
      { id: "seg-b", startMs: 4000, speakerKey: "r1:SPK2", text: "Ich mache das." },
    ],
  };

  it("references segments compactly with speaker names", () => {
    const { refs, text } = buildTranscriptBlock(input);
    expect(refs.get("S2")).toBe("seg-b");
    expect(text).toContain("[S1 00:00:00 Anna] Wir reichen ein.");
  });

  it("maps evidence, drops unknown ids and assignees, and removes ungrounded decisions and tasks", () => {
    const { refs } = buildTranscriptBlock(input);
    const content = normalizeProtocol({
      summary: "Kurz.",
      agendaItems: [{ key: "a1", title: "Förderung", summary: "", evidence: ["S1", "S99"] }],
      decisions: [{ key: "d1", text: "Einreichen", evidence: ["S1"] }, { key: "d2", text: "Erfunden", evidence: ["S42"] }],
      actionItems: [
        { itemKey: "t1", text: "Antrag senden", assigneeUserId: "u1", dueDate: "2026-13-45", evidence: ["S2"] },
        { itemKey: "t2", text: "Fremd", assigneeUserId: "intruder", dueDate: "2026-10-09", evidence: ["S2"] },
      ],
      openQuestions: [],
    }, refs, new Set(["u1"]));
    expect(content).not.toBeNull();
    expect(content!.agendaItems[0].evidence).toEqual(["seg-a"]);
    expect(content!.decisions.map((item) => item.key)).toEqual(["d1"]);
    expect(content!.actionItems).toEqual([
      { itemKey: "t1", text: "Antrag senden", assigneeUserId: "u1", dueDate: null, evidence: ["seg-b"] },
      { itemKey: "t2", text: "Fremd", assigneeUserId: null, dueDate: "2026-10-09", evidence: ["seg-b"] },
    ]);
  });

  it("rejects duplicate item keys", () => {
    const { refs } = buildTranscriptBlock(input);
    expect(normalizeProtocol({
      summary: "", agendaItems: [], decisions: [], openQuestions: [],
      actionItems: [
        { itemKey: "t1", text: "A", assigneeUserId: null, dueDate: null, evidence: ["S1"] },
        { itemKey: "t1", text: "B", assigneeUserId: null, dueDate: null, evidence: ["S2"] },
      ],
    }, refs, new Set())).toBeNull();
  });
});
