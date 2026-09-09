export type SearchableEditorCommand = { id: string; label: string; keywords?: string[]; contextPriority?: number; recentIndex?: number; disabledReason?: string };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().trim();

// Bounded edit distance, including adjacent transpositions. Short searches stay exact.
function typoMatch(term: string, word: string) {
  const limit = term.length >= 7 ? 2 : 1;
  if (term.length < 4 || Math.abs(term.length - word.length) > limit) return false;
  const rows = Array.from({ length: term.length + 1 }, (_, i) => [i, ...Array<number>(word.length).fill(0)]);
  for (let j = 0; j <= word.length; j++) rows[0][j] = j;
  for (let i = 1; i <= term.length; i++) for (let j = 1; j <= word.length; j++) {
    rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + Number(term[i - 1] !== word[j - 1]));
    if (i > 1 && j > 1 && term[i - 1] === word[j - 2] && term[i - 2] === word[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
  }
  return rows[term.length][word.length] <= limit;
}

export function recentEditorCommands(raw: string | null): string[] {
  try { const value: unknown = JSON.parse(raw ?? "[]"); return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length <= 100))].slice(0, 8) : []; } catch { return []; }
}
export function rememberEditorCommand(previous: string[], id: string) { return [id, ...previous.filter((item) => item !== id)].slice(0, 8); }

export function searchEditorCommands<T extends SearchableEditorCommand>(commands: T[], query: string): T[] {
  const text = normalize(query).slice(0, 120);
  const terms = text.split(/\s+/);
  const ranked = commands.map((command, index) => {
    const label = normalize(command.label);
    const haystack = normalize([command.label, command.id, command.id.replace(/([a-z])([A-Z])/g, "$1 $2"), ...(command.keywords ?? [])].join(" "));
    const words = haystack.split(/[^\p{L}\p{N}]+/u);
    const exact = terms.every((term) => haystack.includes(term));
    const matches = exact || terms.every((term) => haystack.includes(term) || words.some((word) => typoMatch(term, word)));
    const score = !text ? 0 : label === text ? 0 : label.startsWith(text) ? 1 : label.includes(text) ? 2 : exact ? 3 : 4;
    return { command, index, score, matches };
  }).filter((item) => item.matches);
  const exactMatches = ranked.filter((item) => item.score < 4);
  return (exactMatches.length ? exactMatches : ranked).sort((a, b) => a.score - b.score
    || Number(Boolean(a.command.disabledReason)) - Number(Boolean(b.command.disabledReason))
    || (b.command.contextPriority ?? 0) - (a.command.contextPriority ?? 0)
    || (!text ? (a.command.recentIndex ?? 99) - (b.command.recentIndex ?? 99) : 0)
    || a.index - b.index).map((item) => item.command);
}

/** Two short, unmodified Shift taps; chords, repeats and interruptions cancel. */
export function createDoubleShiftDetector() {
  let downAt: number | null = null;
  let lastTap: number | null = null;
  const reset = () => { downAt = null; lastTap = null; };
  return {
    reset,
    handle(event: { type: string; key: string; repeat?: boolean; isComposing?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean }, now: number) {
      if (event.key !== "Shift" || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) { reset(); return false; }
      if (event.type === "keydown") { if (downAt !== null) reset(); else downAt = now; return false; }
      if (event.type !== "keyup" || downAt === null || now - downAt > 300) { reset(); return false; }
      downAt = null;
      if (lastTap !== null && now - lastTap <= 400) { reset(); return true; }
      lastTap = now;
      return false;
    },
  };
}
