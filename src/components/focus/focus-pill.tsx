"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Minimize2, PanelTop, Search } from "lucide-react";
import { useFocusMode } from "@/components/focus-mode";
import { Button } from "@/components/ui/button";
import { ShortcutKeys } from "@/components/ui/shortcut-tooltip";
import { GLOBAL_SHORTCUTS } from "@/lib/app-shortcuts";
import { ariaKeyShortcuts } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { openWorkspaceSearch } from "@/modules/context/components/workspace-search";

const IDLE_AFTER_MS = 3000;

/**
 * The only chrome left in global focus mode: search, the hidden workspace tabs and the way
 * out. It dims while unused on pointer devices and stays fully visible on touch screens.
 */
export function FocusPill({
  hasTabs,
  tabsRevealed,
  onToggleTabs,
}: {
  hasTabs: boolean;
  tabsRevealed: boolean;
  onToggleTabs: () => void;
}) {
  const t = useTranslations("focus");
  const tCommon = useTranslations("common");
  const { globalFocused, exitFocus } = useFocusMode();
  const [idle, setIdle] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function wake() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setIdle(false);
  }
  function rest() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setIdle(true), IDLE_AFTER_MS);
  }

  useEffect(() => {
    if (!globalFocused) return;
    timer.current = setTimeout(() => setIdle(true), IDLE_AFTER_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setIdle(false);
    };
  }, [globalFocused]);

  if (!globalFocused) return null;

  return (
    <div
      role="toolbar"
      aria-label={t("controls")}
      data-testid="focus-pill"
      data-idle={idle || undefined}
      onPointerEnter={wake}
      onPointerLeave={rest}
      onFocus={wake}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) rest();
      }}
      className={cn(
        "fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-background/95 p-1 shadow-lg backdrop-blur",
        "transition-opacity duration-300 motion-reduce:transition-none [@media(hover:none)]:opacity-100",
        idle ? "opacity-40" : "opacity-100",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="rounded-full"
        aria-label={tCommon("search")}
        title={tCommon("search")}
        aria-keyshortcuts={ariaKeyShortcuts(GLOBAL_SHORTCUTS.search)}
        onClick={openWorkspaceSearch}
      >
        <Search className="size-4" />
      </Button>
      {hasTabs && (
        <Button
          type="button"
          variant={tabsRevealed ? "secondary" : "ghost"}
          size="icon-sm"
          className="rounded-full"
          aria-label={tabsRevealed ? t("hideTabs") : t("showTabs")}
          title={tabsRevealed ? t("hideTabs") : t("showTabs")}
          aria-pressed={tabsRevealed}
          onClick={onToggleTabs}
        >
          <PanelTop className="size-4" />
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="rounded-full"
        aria-label={t("exit")}
        aria-keyshortcuts={ariaKeyShortcuts(GLOBAL_SHORTCUTS.focusMode)}
        onClick={exitFocus}
      >
        <Minimize2 className="size-4" />
        {t("exit")}
        <ShortcutKeys shortcut={GLOBAL_SHORTCUTS.focusMode} className="ml-1 hidden text-muted-foreground sm:inline-flex" />
      </Button>
    </div>
  );
}
