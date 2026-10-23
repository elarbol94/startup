// Laptop layout: below 1536 CSS px (1920px panels at 125–150% scaling, 1366/1440px screens,
// windows snapped side by side) side panels start collapsed. Laptop and wide screens remember
// their own choice per panel, so docking to a monitor and back restores each layout.
// Mod+Shift+X collapses every visible side panel, or expands them when none is open.
// Server-safe (the rail bootstrap script uses it); the hooks live in use-compact-layout.ts.

export const COMPACT_LAYOUT_QUERY = "(max-width: 1535.98px)";

/** The wide-screen key stays the panel's original key, so existing choices carry over. */
export function compactStorageKey(key: string, compact: boolean): string {
  return compact ? `${key}:compact` : key;
}

/** A stored choice wins; without one a panel is collapsed exactly on laptop widths. */
export function storedCollapsed(value: string | null, compact: boolean): boolean {
  return value === null ? compact : value === "true" || value === "1";
}

export const SIDE_PANELS_EVENT = "app-side-panels";

/** Panels mark themselves with `data-side-panel="expanded|collapsed"`; hidden ones do not count. */
export function toggleSidePanels() {
  const collapse = [...document.querySelectorAll('[data-side-panel="expanded"]')].some((panel) => panel.getClientRects().length > 0);
  window.dispatchEvent(new CustomEvent<boolean>(SIDE_PANELS_EVENT, { detail: collapse }));
}
