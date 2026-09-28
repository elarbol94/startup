/** Words of `expected` that are missing from `actual` (multiset), ignoring whitespace and checkbox glyphs. */
export function missingWords(expected: string, actual: string) {
  const words = (text: string) => text.replace(/[☐☑]/g, " ").split(/\s+/).map((word) => word.trim()).filter(Boolean);
  const available = new Map<string, number>();
  for (const word of words(actual)) available.set(word, (available.get(word) ?? 0) + 1);
  const missing: string[] = [];
  for (const word of words(expected)) {
    const count = available.get(word) ?? 0;
    if (count > 0) available.set(word, count - 1);
    else missing.push(word);
  }
  return missing;
}
