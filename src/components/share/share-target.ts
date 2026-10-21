"use client";

// What "share this page" means right now. Normally the page in the address bar; while a
// workspace tab (an iframe pane, see components/workspace) is in front, that tab's page.
// AppWorkspace registers a resolver for the front tab, so the global share button needs no props.
import type { ShareTarget } from "@/lib/share-links";

let workspaceResolver: (() => ShareTarget | null) | null = null;

/**
 * Called by AppWorkspace. The resolver returns the front tab's page, or null when the main page
 * is in front; it is asked at click time because panes navigate without re-rendering the shell.
 */
export function setWorkspaceShareResolver(resolver: (() => ShareTarget | null) | null) {
  workspaceResolver = resolver;
}

/** The page's own heading is more specific than the document title ("Projekt Alpha" vs "Projekte"). */
function pageHeading(): string {
  const heading = document.querySelector("#workspace-panel-primary h1") ?? document.querySelector("main h1");
  return heading?.textContent?.trim() ?? "";
}

export function currentPageShareTarget(): ShareTarget {
  const tab = workspaceResolver?.();
  if (tab) return tab;
  const { pathname, search, hash } = window.location;
  return { href: `${pathname}${search}${hash}`, title: pageHeading() || document.title };
}
