/** A source passage prepared in the reader for linking from either text editor. */
export const SOURCE_PASSAGE_KEY = "wiki:source-passage:v1";
export const SOURCE_PASSAGE_EVENT = "wiki:source-passage";
export type SourcePassage = { href: string; title: string; quote: string };

export function isSourcePassageHref(value: string) {
  return /^\/wiki\/sources\/[a-z0-9]+\/read\/[a-z0-9]+\?page=[1-9]\d*&annotation=[a-z0-9]+$/.test(value);
}

export function parseSourcePassage(raw: string | null): SourcePassage | null {
  if (!raw || raw.length > 24_000) return null;
  try {
    const value = JSON.parse(raw) as SourcePassage;
    if (typeof value.href !== "string" || !isSourcePassageHref(value.href)) return null;
    if (typeof value.title !== "string" || typeof value.quote !== "string") return null;
    return { href: value.href, title: value.title.slice(0, 300), quote: value.quote.slice(0, 1000) };
  } catch { return null; }
}

export function rememberSourcePassage(passage: SourcePassage) {
  // Store only a reference and a short preview, shared by tabs on this origin.
  localStorage.setItem(SOURCE_PASSAGE_KEY, JSON.stringify({ ...passage, quote: passage.quote.slice(0, 1000), title: passage.title.slice(0, 300) }));
  window.dispatchEvent(new Event(SOURCE_PASSAGE_EVENT));
}
