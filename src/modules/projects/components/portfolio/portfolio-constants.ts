// Layout, zoom, gesture and storage constants for the portfolio Gantt timeline.
// Used by portfolio-client.tsx and the pieces in components/portfolio/.
import type { DependencyType } from "@/modules/projects/schedule";
import type { Zoom } from "./portfolio-types";

export const LEFT_WIDTH = 440;
export const ROW_HEIGHT = 44;
export const HEADER_HEIGHT = 54;
export const DEADLINE_LANE_HEIGHT = 36;
export const FIT_PADDING_DAYS = 7;
export const DAY_MS = 86_400_000;
export const ZOOM_WIDTH: Record<Zoom, number> = {
  week: 32,
  month: 16,
  quarter: 7,
};
export const MIN_DAY_WIDTH = 6;
export const MAX_DAY_WIDTH = 44;
export const ZOOM_WHEEL_SENSITIVITY = 0.0015;
export const FOCUS_VIEW_STORAGE_KEY = "projects.focusPortfolioView";
export const DEPENDENCY_TYPE_OPTIONS: DependencyType[] = [
  "finish_to_start",
  "start_to_start",
  "finish_to_finish",
  "start_to_finish",
];
export const DRAG_CLICK_THRESHOLD = 4;
/** Widest grab zone (px) at each end of a Gantt bar that resizes instead of moving it. */
export const BAR_EDGE_GRAB_WIDTH = 8;
