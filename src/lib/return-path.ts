// Where to send someone after they sign in. A shared link opened while signed out goes through
// /login?next=<path>; src/proxy.ts hands the requested path to requireUser in this header.
// `next` arrives from the URL, so only same-origin, in-app paths survive (no open redirect).

/** Request header src/proxy.ts sets to the path and query being rendered. */
export const RETURN_PATH_HEADER = "x-return-path";

const MAX_RETURN_PATH_LENGTH = 2048;
const PARSE_BASE = "https://return-path.invalid";
/** Places that make no sense to return to after signing in. */
const EXCLUDED_PATHS = ["/login", "/invite", "/api", "/_next"];

/**
 * Returns `value` as a path on this site, or null when it is missing, external,
 * protocol-relative, malformed or points back into the sign-in flow.
 */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > MAX_RETURN_PATH_LENGTH) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  // Tabs and newlines are stripped by URL parsing, which would turn "/\t/evil" into "//evil".
  if (/[\u0000-\u001f\u007f]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value, PARSE_BASE);
  } catch {
    return null;
  }
  if (url.origin !== PARSE_BASE) return null;
  // React Server Component requests carry a cache-busting parameter that is not part of the page.
  url.searchParams.delete("_rsc");
  const { pathname } = url;
  if (EXCLUDED_PATHS.some((excluded) => pathname === excluded || pathname.startsWith(`${excluded}/`))) return null;
  return `${pathname}${url.search}${url.hash}`;
}

/** The sign-in page, remembering `path` when it is worth returning to. */
export function loginHref(path: string | null | undefined): string {
  const safe = safeReturnPath(path);
  return safe && safe !== "/" ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}
