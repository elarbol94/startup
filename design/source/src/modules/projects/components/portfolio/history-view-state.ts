// Per-history-entry snapshot of the portfolio view, so browser Back/Forward to /projects
// restores the exact previous view (scroll, zoom, expansion, filters). The snapshot lives in
// sessionStorage under an id stored in that history entry's state. Used by use-history-view.ts.
import { MAX_DAY_WIDTH, MIN_DAY_WIDTH } from "./portfolio-constants";

export const HISTORY_VIEW_ID_FIELD = "portfolioViewId";
const STORAGE_PREFIX = "projects.historyView.";

export type HistoryPortfolioView = {
  view: "timeline" | "projects";
  query: string;
  owner: string;
  health: "all" | "risk" | "track";
  criticalVisible: boolean;
  linesVisible: boolean;
  dayWidth: number;
  treeWidth: number;
  scrollLeft: number;
  scrollTop: number;
  expandedProjects: string[];
  expandedTasks: string[];
};

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

/** Returns the view id stored in a history state object, if any. */
export function historyViewId(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const id = (state as Record<string, unknown>)[HISTORY_VIEW_ID_FIELD];
  return typeof id === "string" && id ? id : null;
}

/** Copies a history state object (keeping Next.js router fields) and tags it with the view id. */
export function withHistoryViewId(state: unknown, id: string): Record<string, unknown> {
  const base = state && typeof state === "object" ? (state as Record<string, unknown>) : {};
  return { ...base, [HISTORY_VIEW_ID_FIELD]: id };
}

export function writeHistoryView(storage: KeyValueStorage, id: string, view: HistoryPortfolioView) {
  storage.setItem(STORAGE_PREFIX + id, JSON.stringify(view));
}

const num = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
const strings = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

/** Reads and sanitises a stored snapshot; returns null when missing or malformed. */
export function readHistoryView(storage: KeyValueStorage, id: string): HistoryPortfolioView | null {
  let raw: unknown;
  try {
    raw = JSON.parse(storage.getItem(STORAGE_PREFIX + id) ?? "null");
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  return {
    view: data.view === "projects" ? "projects" : "timeline",
    query: typeof data.query === "string" ? data.query : "",
    owner: typeof data.owner === "string" ? data.owner : "all",
    health: data.health === "risk" || data.health === "track" ? data.health : "all",
    criticalVisible: data.criticalVisible === true,
    linesVisible: data.linesVisible !== false,
    dayWidth: Math.min(MAX_DAY_WIDTH, Math.max(MIN_DAY_WIDTH, num(data.dayWidth, MIN_DAY_WIDTH))),
    treeWidth: num(data.treeWidth, 0),
    scrollLeft: Math.max(0, num(data.scrollLeft, 0)),
    scrollTop: Math.max(0, num(data.scrollTop, 0)),
    expandedProjects: strings(data.expandedProjects),
    expandedTasks: strings(data.expandedTasks),
  };
}
