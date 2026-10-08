import { describe, expect, it } from "vitest";
import {
  keepRangesFilter,
  parseSilenceDetect,
  planTranscription,
  segmentsToOriginal,
  speechRanges,
  toCompactMs,
  toOriginalMs,
} from "./silence";

const min = 60_000;
const options = { minGapMs: 10_000, padMs: 1_000, maxRanges: 400 };

describe("parseSilenceDetect", () => {
  it("reads ffmpeg output and closes a silence running to the end", () => {
    const output = [
      "[silencedetect @ 0x1] silence_start: -0.01",
      "[silencedetect @ 0x1] silence_end: 2.5 | silence_duration: 2.51",
      "size=N/A time=00:01:00.00",
      "[silencedetect @ 0x1] silence_start: 40.25",
    ].join("\n");
    expect(parseSilenceDetect(output, 60_000)).toEqual([{ startMs: 0, endMs: 2500 }, { startMs: 40_250, endMs: 60_000 }]);
    expect(parseSilenceDetect(output)).toEqual([{ startMs: 0, endMs: 2500 }]);
  });
});

describe("speechRanges", () => {
  it("removes long silences but keeps padding next to speech", () => {
    expect(speechRanges(10 * min, [
      { startMs: 0, endMs: 30_000 }, // leading silence: no padding needed before it
      { startMs: 60_000, endMs: 65_000 }, // too short to remove
      { startMs: 2 * min, endMs: 5 * min },
      { startMs: 9 * min, endMs: 10 * min }, // trailing silence
    ], options)).toEqual([
      { startMs: 29_000, endMs: 2 * min + 1000 },
      { startMs: 5 * min - 1000, endMs: 9 * min + 1000 },
    ]);
  });

  it("returns nothing for a silent recording and everything without silences", () => {
    expect(speechRanges(5 * min, [{ startMs: 0, endMs: 5 * min }], options)).toEqual([]);
    expect(speechRanges(5 * min, [], options)).toEqual([{ startMs: 0, endMs: 5 * min }]);
    expect(speechRanges(0, [], options)).toEqual([]);
  });

  it("removes only the longest gaps when there would be too many ranges", () => {
    const silences = [
      { startMs: 1 * min, endMs: 1 * min + 20_000 },
      { startMs: 3 * min, endMs: 3 * min + 50_000 },
      { startMs: 6 * min, endMs: 6 * min + 30_000 },
    ];
    const ranges = speechRanges(10 * min, silences, { ...options, maxRanges: 3 });
    expect(ranges).toEqual([
      { startMs: 0, endMs: 3 * min + 1000 },
      { startMs: 3 * min + 49_000, endMs: 6 * min + 1000 },
      { startMs: 6 * min + 29_000, endMs: 10 * min },
    ]);
  });
});

describe("time mapping", () => {
  const ranges = [{ startMs: 10_000, endMs: 20_000 }, { startMs: 100_000, endMs: 130_000 }];

  it("maps compacted times back to the original timeline", () => {
    expect(toOriginalMs(ranges, 0)).toBe(10_000);
    expect(toOriginalMs(ranges, 5_000)).toBe(15_000);
    expect(toOriginalMs(ranges, 10_000)).toBe(100_000);
    expect(toOriginalMs(ranges, 10_000, "end")).toBe(20_000);
    expect(toOriginalMs(ranges, 25_000)).toBe(115_000);
    // Past the end (re-encoding may add a few ms) stays in the last range.
    expect(toOriginalMs(ranges, 40_500)).toBe(130_500);
  });

  it("maps original times into the compacted audio", () => {
    expect(toCompactMs(ranges, 0)).toBe(0);
    expect(toCompactMs(ranges, 15_000)).toBe(5_000);
    expect(toCompactMs(ranges, 50_000)).toBe(10_000);
    expect(toCompactMs(ranges, 110_000)).toBe(20_000);
    expect(toCompactMs(ranges, 200_000)).toBe(40_000);
    for (const point of [12_345, 101_000, 129_999]) expect(toOriginalMs(ranges, toCompactMs(ranges, point))).toBe(point);
  });

  it("moves segments back, keeping an end on a border in its own range", () => {
    expect(segmentsToOriginal(ranges, [
      { startMs: 2_000, endMs: 10_000, speakerKey: "SPK1", text: "a" },
      { startMs: 10_000, endMs: 14_000, speakerKey: "SPK2", text: "b" },
    ])).toEqual([
      { startMs: 12_000, endMs: 20_000, speakerKey: "SPK1", text: "a" },
      { startMs: 100_000, endMs: 104_000, speakerKey: "SPK2", text: "b" },
    ]);
  });

  it("builds an ffmpeg filter selecting only the kept ranges", () => {
    expect(keepRangesFilter(ranges)).toBe("aselect='between(t,10.000,20.000)+between(t,100.000,130.000)',asetpts=N/SR/TB");
  });
});

describe("planTranscription", () => {
  it("skips a silent recording entirely", () => {
    expect(planTranscription(2 * 60 * min, [{ startMs: 0, endMs: 2 * 60 * min }], 20 * min)).toEqual({ ranges: [], chunks: [], skippedMs: 2 * 60 * min });
  });

  it("sends the original when little silence would be removed", () => {
    expect(planTranscription(5 * min, [{ startMs: min, endMs: min + 15_000 }], 20 * min))
      .toEqual({ ranges: null, chunks: [{ startMs: 0, durationMs: 5 * min }], skippedMs: 0 });
  });

  it("compacts long silences and plans chunks on the compacted timeline", () => {
    // 2 h track, speech only in the first 10 and the last 25 minutes.
    const plan = planTranscription(120 * min, [{ startMs: 10 * min, endMs: 95 * min }, { startMs: 105 * min, endMs: 105 * min + 2000 }], 20 * min);
    expect(plan.ranges).toEqual([{ startMs: 0, endMs: 10 * min + 1000 }, { startMs: 95 * min - 1000, endMs: 120 * min }]);
    expect(plan.skippedMs).toBe(85 * min - 2000);
    // The removed stretch and the short pause become cut points in the compacted audio.
    expect(plan.chunks).toEqual([
      { startMs: 0, durationMs: 10 * min + 1000 },
      { startMs: 10 * min + 1000, durationMs: 10 * min + 2000 },
      { startMs: 20 * min + 3000, durationMs: 15 * min - 1000 },
    ]);
  });
});
