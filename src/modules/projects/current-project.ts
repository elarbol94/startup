// The "current project": the project whose page is open. New tasks, events,
// time entries and invoices started from there are pre-linked to it.

/** Project id of a `/projects/<id>` route, otherwise null. */
export function projectIdFromPath(pathname: string | null | undefined) {
  const match = pathname?.match(/^\/projects\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Adds `project=<id>` to an internal href when there is a current project. */
export function withProjectParam(href: string, projectId: string | null) {
  if (!projectId) return href;
  return `${href}${href.includes("?") ? "&" : "?"}project=${encodeURIComponent(projectId)}`;
}
