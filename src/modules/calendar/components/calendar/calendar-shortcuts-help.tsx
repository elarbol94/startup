"use client";

// Keyboard-shortcut help for the calendar: a toolbar button with a popover listing the keys,
// also opened with "?". Exports CalendarShortcutKeys for toolbar tooltips. Used by calendar-toolbar.tsx.
import { Keyboard } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ShortcutKeys, ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { CALENDAR_PAGE_SHORTCUTS as KEYS } from "@/lib/app-shortcuts";

const GLYPHS: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", Escape: "Esc", Enter: "↵" };

/** Like ShortcutKeys, but shows arrow keys and Escape as glyphs; several shortcuts are joined by "/". */
export function CalendarShortcutKeys({ shortcuts }: { shortcuts: string[] }) {
  return (
    <KbdGroup>
      {shortcuts.map((shortcut, index) => (
        <span key={shortcut} className="inline-flex items-center gap-1">
          {index > 0 && <span className="text-[10px] opacity-70">/</span>}
          {GLYPHS[shortcut] ? <Kbd>{GLYPHS[shortcut]}</Kbd> : <ShortcutKeys shortcut={shortcut} />}
        </span>
      ))}
    </KbdGroup>
  );
}

type Label = Parameters<ReturnType<typeof useTranslations<"calendar">>>[0];

const LIST: { label: Label; shortcuts: string[] }[] = [
  { label: "shortcutToday", shortcuts: [KEYS.today] },
  { label: "shortcutPrevious", shortcuts: [KEYS.previous] },
  { label: "shortcutNext", shortcuts: [KEYS.next] },
  { label: "shortcutDayView", shortcuts: [KEYS.day] },
  { label: "shortcutWorkweekView", shortcuts: [KEYS.workweek] },
  { label: "shortcutWeekView", shortcuts: [KEYS.week] },
  { label: "shortcutMonthView", shortcuts: [KEYS.month] },
  { label: "shortcutAgendaView", shortcuts: [KEYS.agenda] },
  { label: "shortcutTeamView", shortcuts: [KEYS.team] },
  { label: "shortcutNewEvent", shortcuts: [KEYS.newEvent] },
  { label: "shortcutSearch", shortcuts: [KEYS.search] },
  { label: "shortcutDeselect", shortcuts: [KEYS.deselect] },
  { label: "shortcutUndo", shortcuts: [KEYS.undo] },
  { label: "shortcutShowHelp", shortcuts: [KEYS.help] },
];

export function CalendarShortcutsHelp({
  open,
  onOpenChange,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: ReturnType<typeof useTranslations<"calendar">>;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <ShortcutTooltip label={t("shortcutHelp")} shortcut={KEYS.help} hint={t("hintShortcuts")}>
        <PopoverTrigger
          render={
            <Button variant="ghost" size="icon-sm" className="hidden size-11 sm:inline-flex" aria-label={t("shortcutHelp")}>
              <Keyboard className="size-4" />
            </Button>
          }
        />
      </ShortcutTooltip>
      <PopoverContent align="end" className="w-80 text-xs">
        <p className="font-medium">{t("shortcutHelp")}</p>
        <dl className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5">
          {LIST.map(({ label, shortcuts }) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{t(label)}</dt>
              <dd>
                <CalendarShortcutKeys shortcuts={shortcuts} />
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-muted-foreground">{t("shortcutHint")}</p>
      </PopoverContent>
    </Popover>
  );
}
