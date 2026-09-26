// Keyboard shortcuts of the /projects toolbar (map in lib/app-shortcuts.ts) and the list shown in
// the toolbar's help popover. Used by portfolio-toolbar.tsx.
"use client";

import { useTranslations } from "next-intl";
import { useKeyboardShortcut } from "@/components/use-keyboard-shortcut";
import { ShortcutKeys } from "@/components/ui/shortcut-tooltip";
import { PROJECTS_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
import type { SetState, Zoom } from "./portfolio-types";

export function useTimelineToolbarShortcuts({
  enabled,
  viewSwitchEnabled,
  view,
  setView,
  setTimelineZoom,
  scrollToToday,
  focusSearch,
}: {
  enabled: boolean;
  viewSwitchEnabled: boolean;
  view: "timeline" | "projects";
  setView: SetState<"timeline" | "projects">;
  setTimelineZoom: (zoom: Zoom) => void;
  scrollToToday: () => void;
  focusSearch: () => void;
}) {
  const timeline = enabled && view === "timeline";
  useKeyboardShortcut(PROJECTS_PAGE_SHORTCUTS.timeline, () => setView("timeline"), { enabled: enabled && viewSwitchEnabled });
  useKeyboardShortcut(PROJECTS_PAGE_SHORTCUTS.projectOverview, () => setView("projects"), { enabled: enabled && viewSwitchEnabled });
  useKeyboardShortcut(PROJECTS_PAGE_SHORTCUTS.week, () => setTimelineZoom("week"), { enabled: timeline });
  useKeyboardShortcut(PROJECTS_PAGE_SHORTCUTS.month, () => setTimelineZoom("month"), { enabled: timeline });
  useKeyboardShortcut(PROJECTS_PAGE_SHORTCUTS.quarter, () => setTimelineZoom("quarter"), { enabled: timeline });
  useKeyboardShortcut(PROJECTS_PAGE_SHORTCUTS.today, scrollToToday, { enabled: timeline });
  useKeyboardShortcut(PROJECTS_PAGE_SHORTCUTS.search, focusSearch, { enabled: timeline });
}

const LIST: Array<{ action: keyof typeof PROJECTS_PAGE_SHORTCUTS; label: string }> = [
  { action: "timeline", label: "timeline" },
  { action: "projectOverview", label: "projectOverview" },
  { action: "week", label: "week" },
  { action: "month", label: "month" },
  { action: "quarter", label: "quarter" },
  { action: "today", label: "today" },
  { action: "search", label: "focusSearch" },
  { action: "newProject", label: "newProject" },
];

export function PortfolioShortcutList() {
  const t = useTranslations("projects");
  return (
    <div className="border-t pt-3">
      <p className="mb-2 font-medium">{t("keyboardShortcuts")}</p>
      <dl className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5">
        {LIST.map(({ action, label }) => (
          <div key={action} className="contents">
            <dt className="text-muted-foreground">{t(label)}</dt>
            <dd><ShortcutKeys shortcut={PROJECTS_PAGE_SHORTCUTS[action]} /></dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-muted-foreground">{t("shortcutsHint")}</p>
    </div>
  );
}
