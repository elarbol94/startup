// Building blocks for sharing a page or item as a link in Element or any other chat.
// Which path an item lives at is decided by its module (for example canonicalEntityHref and
// canonicalTaskHref in modules/context/routes.ts); this file only turns such a path into
// something to paste. Pure functions, used by components/share/.

/** What a share action hands to the system share sheet or the clipboard. */
export type ShareTarget = {
  /** In-app path ("/projects/abc?task=t1") or an absolute URL on this site. */
  href: string;
  title: string;
};

const MAX_TITLE_LENGTH = 160;

/**
 * Absolute URL of an in-app path on `origin`. Shared links must point back at this site, so a
 * foreign absolute URL is refused rather than passed on.
 */
export function absoluteShareUrl(href: string, origin: string): string {
  const base = new URL(origin);
  const url = new URL(href, base);
  if (url.origin !== base.origin) throw new Error("Shared links must stay on this site");
  return url.toString();
}

/** One line, trimmed and bounded, so a chat preview stays readable. */
export function shareTitle(title: string, fallback: string): string {
  const clean = title.replace(/\s+/g, " ").trim();
  if (!clean) return fallback;
  return clean.length > MAX_TITLE_LENGTH ? `${clean.slice(0, MAX_TITLE_LENGTH - 1)}…` : clean;
}

/** `[title](url)`: Element, GitHub, Mattermost and others render this as a titled link. */
export function markdownLink(title: string, url: string): string {
  const text = title.replace(/[\\[\]]/g, (char) => `\\${char}`);
  // encodeURIComponent leaves parentheses alone, but they would end the Markdown target.
  const target = url.replace(/[()\s]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
  return `[${text}](${target})`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** The same link for rich-text editors (mail, Word, Element's rich composer). */
export function htmlLink(title: string, url: string): string {
  return `<a href="${escapeHtml(url)}">${escapeHtml(title)}</a>`;
}

/** Plain-text message for chats without Markdown: title on one line, link on the next. */
export function plainShareText(title: string, url: string): string {
  return `${title}\n${url}`;
}
