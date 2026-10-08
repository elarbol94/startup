import { describe, expect, it } from "vitest";
import { CALL_CHECK_HOURS, CALL_SILENCE_MINUTES, IDLE_GRACE_MS, idlePrompt } from "./components/call-idle-utils";
import { guessLanguage, languageMismatch, recordingWarnings } from "./recording-warnings";

const min = 60_000;
const german = [
  "Ich schicke den Antrag bis Freitag an das Land.",
  "Gut, dann ist das beschlossen und wir machen das so.",
  "Ja genau, aber wir müssen noch mit der Gemeinde reden.",
  "Kannst du mir bitte die Unterlagen auch noch schicken?",
];
const lyrics = [
  "I don't know what you want from me, baby",
  "And the night is young and we're never gonna stop",
  "You are the one that I love, it's all in my head",
  "Just feel the rhythm of the night with me",
  "I can see it in your eyes, they never lie to me",
];

describe("language check", () => {
  it("guesses German and English from function words", () => {
    expect(guessLanguage(german[0])).toBe("de");
    expect(guessLanguage(lyrics[0])).toBe("en");
    expect(guessLanguage("Okay.")).toBeNull();
  });

  it("flags a transcript that is mostly in another language", () => {
    expect(languageMismatch([...lyrics, ...lyrics, german[0]], "de")).toBe(true);
    expect(languageMismatch([...german, ...german, lyrics[0]], "de")).toBe(false);
    // Too little text to judge, or a language without a word list.
    expect(languageMismatch(lyrics.slice(0, 2), "de")).toBe(false);
    expect(languageMismatch([...lyrics, ...lyrics], "fr")).toBe(false);
  });
});

describe("recordingWarnings", () => {
  const base = { durationMs: 30 * min, callMs: 32 * min, otherTrackMs: [29 * min], texts: german, meetingLanguage: "de" };

  it("accepts a normal call track and uploads", () => {
    expect(recordingWarnings(base)).toEqual([]);
    expect(recordingWarnings({ ...base, callMs: null, otherTrackMs: [] })).toEqual([]);
  });

  it("flags a track far longer than its call or the other tracks", () => {
    expect(recordingWarnings({ ...base, durationMs: 45 * min })).toEqual(["longerThanCall"]);
    // The forgotten tab kept the call itself open: the other tracks give it away.
    expect(recordingWarnings({ ...base, durationMs: 120 * min, callMs: 121 * min, otherTrackMs: [30 * min, 28 * min], texts: [...lyrics, ...lyrics] }))
      .toEqual(["longerThanOtherTracks", "languageMismatch"]);
    expect(recordingWarnings({ ...base, durationMs: 50 * min, callMs: 60 * min, otherTrackMs: [40 * min] })).toEqual([]);
  });
});

describe("idlePrompt", () => {
  const start = 1_000_000;

  it("asks after the silence limit and counts down the grace period", () => {
    expect(idlePrompt(start + CALL_SILENCE_MINUTES * min - 1, start, start)).toBeNull();
    expect(idlePrompt(start + CALL_SILENCE_MINUTES * min, start, start)).toEqual({ reason: "silence", remainingMs: IDLE_GRACE_MS });
    expect(idlePrompt(start + CALL_SILENCE_MINUTES * min + IDLE_GRACE_MS + 5, start, start)).toEqual({ reason: "silence", remainingMs: 0 });
  });

  it("asks every few hours even while someone is speaking", () => {
    const hours = CALL_CHECK_HOURS * 60 * min;
    expect(idlePrompt(start + hours - 1, start + hours - 2, start)).toBeNull();
    expect(idlePrompt(start + hours + 10_000, start + hours + 9_000, start)).toEqual({ reason: "duration", remainingMs: IDLE_GRACE_MS - 10_000 });
    // Confirming resets the clock.
    expect(idlePrompt(start + hours + 10_000, start + hours + 9_000, start + hours + 5_000)).toBeNull();
  });
});
