// Keyboard shortcuts of the /projects timeline (map in lib/app-shortcuts.ts) and the list shown in
// the toolbar's help popover. The hook is called by portfolio-client.tsx so the timeline keys
// keep working in task focus mode, where the toolbar is replaced by the focus rail.
"use client";

import { useTranslations } from "next-intl";
import { useKeyboardShortcut } from "@/components/use-keyboard-shortcut";
import { ShortcutKeys } from "@/components/ui/shortcut-tooltip";
import { PROJECTS_PAGE_SHORTCUTS, TIMELINE_KEY_HINTS } from "@/lib/app-shortcuts";
import type { SetState, Zoom } from "./portfolio-types";

export function useTimelineShortcuts({
  timelineVisible,
  viewSwitchEnabled,
  searchEnabled,
  setView,
  setTimelineZoom,
  scrollToToday,
  fitTimelineView,
  setCriticalVisible,
  setLinesVisible,
  focusSearch,
  newSubtask,
}: {
  timelineVisible: boolean;
  viewSwitchEnabled: boolean;
  searchEnabled: boolean;
  setView: SetState<"timeline" | "projects">;
  setTimelineZoom: (zoom: Zoom) => void;
  scrollToToday: () => void;
  fitTimelineView: () => void;
  setCriticalVisible: SetState<boolean>;
  setLinesVisible: SetState<boolean>;
  focusSearch: () => void;
  /** Null when there is no focused or selected task that can take a subtask. */
  newSubtask: (() => void) | null;
}) {
  const timeline = { enabled: timelineVisible };
  useKeyboardShortcut(PROJECTS_PAGE_SHORTCUTS.timeline, () => setView("timeline"), { enabled: viewSwitchEnabled });
  useKeyboardShortcut(PROJECTS_PAGE_SHORTCUTS.projectOverview, () => setView("projects"), { enabled: viewSwitchEnabled });
  useKeyboardShortcut(PROJECTS_PAGE_SHORTCUTS.week, () => setTimelineZoom("week"), timeline);
  useKeyboardShortcut(PROJECTS_PAGE_SHORTCUTS.month, () => setTimelineZoom("month"), timeline);
  useKeyboardShortcut(PROJECTS_PAGE_SHORTCUTS.quarter, () => setTimelineZoom("quarter"), timeline);
  useKeyboardShortcut(PROJECTS_PAGE_SHORTCUTS.today, scrollToToday, timeline);
  useKeyboardShortcut(PROJECTS_PAGE_SHORTCUTS.fitView, fitTimelineView, timeline);
  useKeyboardShortcut(PROJECTS_PAGE_SHORTCUTS.criticalPath, () => setCriticalVisible((value) => !value), timeline);
  useKeyboardShortcut(PROJECTS_PAGE_SHORTCUTS.dependencyLines, () => setLinesVisible((value) => !value), timeline);
  useKeyboardShortcut(PROJECTS_PAGE_SHORTCUTS.search, focusSearch, { enabled: timelineVisible && searchEnabled });
  useKeyboardShortcut(PROJECTS_PAGE_SHORTCUTS.newSubtask, () => newSubtask?.(), { enabled: timelineVisible && Boolean(newSubtask) });
}

type ShortcutEntry = { label: string; shortcut: string };

const PAGE_LIST: ShortcutEntry[] = [
  { label: "timeline", shortcut: PROJECTS_PAGE_SHORTCUTS.timeline },
  { label: "projectOverview", shortcut: PROJECTS_PAGE_SHORTCUTS.projectOverview },
  { label: "week", shortcut: PROJECTS_PAGE_SHORTCUTS.week },
  { label: "month", shortcut: PROJECTS_PAGE_SHORTCUTS.month },
  { label: "quarter", shortcut: PROJECTS_PAGE_SHORTCUTS.quarter },
  { label: "today", shortcut: PROJECTS_PAGE_SHORTCUTS.today },
  { label: "fitView", shortcut: PROJECTS_PAGE_SHORTCUTS.fitView },
  { label: "criticalPath", shortcut: PROJECTS_PAGE_SHORTCUTS.criticalPath },
  { label: "dependencyLines", shortcut: PROJECTS_PAGE_SHORTCUTS.dependencyLines },
  { label: "focusSearch", shortcut: PROJECTS_PAGE_SHORTCUTS.search },
  { label: "newProject", shortcut: PROJECTS_PAGE_SHORTCUTS.newProject },
  { label: "newSubtaskShortcut", shortcut: PROJECTS_PAGE_SHORTCUTS.newSubtask },
  { label: "undo", shortcut: TIMELINE_KEY_HINTS.undo },
  { label: "redo", shortcut: TIMELINE_KEY_HINTS.redo },
];

const ROW_LIST: ShortcutEntry[] = [
  { label: "focusTask", shortcut: TIMELINE_KEY_HINTS.focusTask },
  { label: "outdentTask", shortcut: TIMELINE_KEY_HINTS.outdentTask },
  { label: "indentTask", shortcut: TIMELINE_KEY_HINTS.indentTask },
];

export function PortfolioShortcutList() {
  const t = useTranslations("projects");
  const list = (entries: ShortcutEntry[]) => (
    <dl className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5">
      {entries.map(({ label, shortcut }) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{t(label)}</dt>
          <dd><ShortcutKeys shortcut={shortcut} /></dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div className="border-t pt-3">
      <p className="mb-2 font-medium">{t("keyboardShortcuts")}</p>
      {list(PAGE_LIST)}
      <p className="mt-3 mb-2 font-medium">{t("rowShortcuts")}</p>
      {list(ROW_LIST)}
      <p className="mt-2 text-muted-foreground">{t("shortcutsHint")}</p>
    </div>
  );
}
