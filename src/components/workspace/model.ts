export const MIN_SPLIT_WIDTH = 1100;
export const MAX_WORKSPACE_TABS = 8;

/** Only authenticated app pages may be embedded; never actions, files or external URLs. */
export function workspaceHref(value: string, origin: string): string | null {
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.username || url.password) return null;
    if (!/^\/(?:$|(?:wiki|municipalities|projects|calendar|accounting|personnel|documents|settings)(?:\/|$))/.test(url.pathname)) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}

export function splitRatio(value: number, width: number): number {
  const minimum = Math.max(30, Math.min(45, 440 / Math.max(width, 1) * 100));
  return Math.max(minimum, Math.min(100 - minimum, value));
}

export type WorkspaceSession = { tabs: Array<{ id: string; href: string; title: string }>; active: string; leftPane: string; secondary: string | null; split: boolean; ratio: number };
export function restoreWorkspace(raw: string | null, origin: string): WorkspaceSession | null {
  try {
    const data = JSON.parse(raw || "null");
    if (!data || !Array.isArray(data.tabs)) return null;
    const ids = new Set<string>();
    const tabs: WorkspaceSession["tabs"] = [];
    for (const tab of data.tabs.slice(0, MAX_WORKSPACE_TABS)) {
      if (!tab || typeof tab.id !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(tab.id) || tab.id === "primary" || ids.has(tab.id) || typeof tab.href !== "string" || typeof tab.title !== "string") continue;
      const href = workspaceHref(tab.href, origin);
      if (!href) continue;
      ids.add(tab.id); tabs.push({ id: tab.id, href, title: tab.title.slice(0, 160) });
    }
    const valid = (id: unknown): id is string => typeof id === "string" && (id === "primary" || ids.has(id));
    const leftPane = valid(data.leftPane) ? data.leftPane : "primary";
    const secondary = valid(data.secondary) && data.secondary !== leftPane ? data.secondary : null;
    return { tabs, active: valid(data.active) ? data.active : "primary", leftPane, secondary, split: data.split === true && secondary !== null, ratio: typeof data.ratio === "number" && Number.isFinite(data.ratio) ? Math.max(30, Math.min(70, data.ratio)) : 50 };
  } catch { return null; }
}

/** Search may return both a source and passages/PDFs within that same source. */
export function workspaceDestinationKey(href: string): string {
  const path = href.split(/[?#]/)[0];
  return /^\/wiki\/(?:sources|pages|presentations)\/[^/]+/.exec(path)?.[0] || href;
}
