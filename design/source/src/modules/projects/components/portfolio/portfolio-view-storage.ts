// sessionStorage persistence of the portfolio view across focus mode.
// Used by use-portfolio-focus.ts.
import { FOCUS_VIEW_STORAGE_KEY } from "./portfolio-constants";
import type {
  PortfolioViewState,
  StoredPortfolioViewState,
} from "./portfolio-types";

export function storePortfolioView(focusedTaskId: string, view: PortfolioViewState) {
  try {
    const stored: StoredPortfolioViewState = {
      focusedTaskId,
      view: {
        ...view,
        expandedProjects: [...view.expandedProjects],
        expandedTasks: [...view.expandedTasks],
      },
    };
    window.sessionStorage.setItem(
      FOCUS_VIEW_STORAGE_KEY,
      JSON.stringify(stored),
    );
  } catch {
    // Focus remains functional when browser storage is unavailable.
  }
}

export function readStoredPortfolioView(
  focusedTaskId: string,
): PortfolioViewState | null {
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(FOCUS_VIEW_STORAGE_KEY) ?? "null",
    ) as StoredPortfolioViewState | null;
    if (!stored || stored.focusedTaskId !== focusedTaskId) return null;
    return {
      ...stored.view,
      expandedProjects: new Set(stored.view.expandedProjects),
      expandedTasks: new Set(stored.view.expandedTasks),
    };
  } catch {
    return null;
  }
}

export function clearStoredPortfolioView() {
  try {
    window.sessionStorage.removeItem(FOCUS_VIEW_STORAGE_KEY);
  } catch {
    // Nothing to clear when browser storage is unavailable.
  }
}
