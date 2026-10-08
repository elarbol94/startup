// Cheap plausibility checks for transcribed recordings, shown as warnings on
// the recording. A microphone left on with music in the background produces a
// track far longer than the call or the other tracks, and a transcript in
// another language (song lyrics). Pure functions, unit-tested directly.

export type RecordingWarning = "longerThanCall" | "longerThanOtherTracks" | "languageMismatch";

/**
 * Frequent function words that do not exist in the other language. Words
 * shared by German and English ("in", "was", "will", "so", "die", "also")
 * are left out on purpose.
 */
const FUNCTION_WORDS: Record<string, Set<string>> = {
  de: new Set(("der das und ist nicht ich wir ein eine einen mit auf für von den dem des sich auch noch wie aber oder dass "
    + "jetzt sind haben hat wird kann schon mal ja nein genau dann wenn hier gut sehr mir mich du ihr sie es zu im bei "
    + "nur doch eben bitte danke machen müssen würde könnte").split(" ")),
  en: new Set(("the and is are you your that this with of to be my me don't what it it's i i'm we're they have "
    + "on at just can there from been would could should yeah gonna wanna baby love never feel know").split(" ")),
};

const words = (text: string) => text.toLowerCase().match(/[\p{L}']+/gu) ?? [];

/** The language a piece of text is most likely in, or null when it is too short or unclear. */
export function guessLanguage(text: string): string | null {
  const scores = Object.entries(FUNCTION_WORDS).map(([language, list]) => [language, words(text).filter((word) => list.has(word)).length] as const)
    .sort((a, b) => b[1] - a[1]);
  const [best, second] = scores;
  if (!best || best[1] < 2 || best[1] <= (second?.[1] ?? 0)) return null;
  return best[0];
}

/**
 * True when most of the recognisable text is in another language than the
 * meeting's. Languages without a word list are never flagged.
 */
export function languageMismatch(texts: string[], meetingLanguage: string, minWords = 40): boolean {
  const expected = meetingLanguage.toLowerCase().slice(0, 2);
  if (!FUNCTION_WORDS[expected]) return false;
  let matching = 0;
  let other = 0;
  for (const text of texts) {
    const language = guessLanguage(text);
    if (!language) continue;
    if (language === expected) matching += words(text).length;
    else other += words(text).length;
  }
  return matching + other >= minWords && other > matching;
}

/** A track counts as "far longer" with this much slack, so egress start-up delays never trigger it. */
const slackMs = (referenceMs: number) => Math.max(5 * 60_000, referenceMs * 0.1);

export function recordingWarnings(input: {
  durationMs: number | null;
  /** Length of the call the track belongs to; null for uploads or a running call. */
  callMs: number | null;
  /** Lengths of the other tracks of the same call. */
  otherTrackMs: number[];
  /** Segment texts of this recording in the current transcript. */
  texts: string[];
  meetingLanguage: string;
}): RecordingWarning[] {
  const warnings: RecordingWarning[] = [];
  const duration = input.durationMs ?? 0;
  if (input.callMs !== null && duration > input.callMs + slackMs(input.callMs)) warnings.push("longerThanCall");
  const longestOther = Math.max(0, ...input.otherTrackMs);
  if (longestOther > 0 && duration >= 2 * longestOther && duration - longestOther >= 20 * 60_000) warnings.push("longerThanOtherTracks");
  if (languageMismatch(input.texts, input.meetingLanguage)) warnings.push("languageMismatch");
  return warnings;
}
