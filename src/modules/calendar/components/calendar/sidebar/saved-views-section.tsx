"use client";

// Saved views list plus a "save view" button.
// Used by calendar-sidebar.tsx and calendar-filters-dialog.tsx.
import { Bookmark, BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import type { CalendarSavedViewValue } from "../../../types";
import type { CalendarT } from "./sidebar-types";
import { SidebarSection } from "./sidebar-section";

export function SavedViewsSection({
  t,
  savedViews,
  onApply,
  saveView,
  hideTitle,
  saveLabel,
}: {
  t: CalendarT;
  savedViews: CalendarSavedViewValue[];
  onApply: (saved: CalendarSavedViewValue) => void;
  saveView: () => void | Promise<void>;
  /** For callers that already show "Saved views" (e.g. a <details> summary). */
  hideTitle?: boolean;
  saveLabel?: string;
}) {
  const list = (
    <div className="space-y-px">
      {savedViews.length === 0 && <p className="px-2 py-1 text-xs text-muted-foreground">{t("sidebarNoSavedViews")}</p>}
      {savedViews.map((saved) => (
        <Button key={saved.id} variant="ghost" size="sm" className="w-full justify-start font-normal" onClick={() => onApply(saved)}>
          <Bookmark className="text-muted-foreground" />
          <span className="truncate">{saved.name}</span>
        </Button>
      ))}
      <ShortcutTooltip label={saveLabel ?? t("sidebarSaveView")} hint={t("hintSaveView")} side="right">
        <Button size="sm" variant="ghost" className="w-full justify-start text-muted-foreground" onClick={() => void saveView()}>
          <BookmarkPlus />
          {saveLabel ?? t("sidebarSaveView")}
        </Button>
      </ShortcutTooltip>
    </div>
  );
  return hideTitle ? list : <SidebarSection title={t("savedViews")}>{list}</SidebarSection>;
}
