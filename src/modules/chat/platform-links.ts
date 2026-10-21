/**
 * The in-app path of a link clicked inside Element, or null when the link should keep
 * Element's own handling: other sites, Element itself (/element/…), API and file
 * downloads, public share pages, and anything that is not http(s). `href` is the
 * anchor's resolved absolute URL; relative values are refused because they resolve
 * against Element's page, not the app.
 */
export function platformLinkPath(href: string, origin: string): string | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.origin !== new URL(origin).origin) return null;
  const path = url.pathname;
  if (path === "/element" || path.startsWith("/element/") || path.startsWith("/api/") || path.startsWith("/share/") || path.startsWith("/_next/")) {
    return null;
  }
  return `${path}${url.search}${url.hash}`;
}
