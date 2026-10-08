"use client";

// Toolbar buttons of the analysis editor that advertise its keyboard shortcuts (handled in
// use-analysis-shortcuts.ts): quick add (Shift twice, like the wiki search) and undo/redo.
import { useTranslations } from "next-intl";
import { Plus, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { MUNICIPALITY_ANALYSIS_KEY_HINTS as KEYS } from "@/lib/app-shortcuts";
import { ariaKeyShortcuts } from "@/lib/shortcuts";

function DoubleShiftKeys({ className }: { className?: string }) {
  return <KbdGroup className={className}><Kbd>⇧</Kbd><Kbd>⇧</Kbd></KbdGroup>;
}

export function AnalysisQuickAddButton({ onOpen }: { onOpen: () => void }) {
  const t = useTranslations("municipalities");
  return (
    <ShortcutTooltip label={t("studioQuickAdd")} keys={<DoubleShiftKeys />} hint={t("studioQuickAddShortcutHint")}>
      <Button variant="outline" size="sm" onClick={onOpen}>
        <Plus className="size-3.5" />
        {t("studioQuickAdd")}
        <DoubleShiftKeys className="ml-1 hidden sm:inline-flex" />
      </Button>
    </ShortcutTooltip>
  );
}

export function AnalysisHistoryButtons({ canUndo, canRedo, onUndo, onRedo }: { canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void }) {
  const t = useTranslations("municipalities");
  return (
    <>
      <ShortcutTooltip label={t("analysisUndo")} shortcut={KEYS.undo}>
        <Button variant="ghost" size="icon-sm" aria-label={t("analysisUndo")} aria-keyshortcuts={ariaKeyShortcuts(KEYS.undo)} disabled={!canUndo} onClick={onUndo}><Undo2 className="size-3.5" /></Button>
      </ShortcutTooltip>
      <ShortcutTooltip label={t("studioRedo")} shortcut={KEYS.redo}>
        <Button variant="ghost" size="icon-sm" aria-label={t("studioRedo")} aria-keyshortcuts={ariaKeyShortcuts(KEYS.redo)} disabled={!canRedo} onClick={onRedo}><Redo2 className="size-3.5" /></Button>
      </ShortcutTooltip>
    </>
  );
}
