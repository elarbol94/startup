"use client";

// Small popover for creating a timed event straight from a selected time range:
// title, start/end time and calendar, with a hand-off to the full event dialog.
// Anchored to a DOMRect (the selection); base-ui flips it to stay in the viewport.
import { type FormEvent, type RefObject, useMemo, useRef, useState } from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { upsertCalendarEvent } from "../../../actions";
import type { CalendarWorkspace } from "../../../types";
import { AustrianTimeInput } from "../austrian-date-time-inputs";
import { CalendarShortcutKeys } from "../calendar-shortcuts-help";
import { useCalendarConfirm } from "../use-calendar-confirm";
import {
  buildQuickEventInput,
  formatQuickDay,
  minutesToTime,
} from "./quick-create-utils";

export type QuickCreateDraft = {
  title: string;
  day: string;
  startTime: string;
  endTime: string;
  calendarId: string;
};

export type QuickCreatePopoverProps = {
  open: boolean;
  anchor: DOMRect | null;
  day: string;
  startMinutes: number;
  endMinutes: number;
  calendars: CalendarWorkspace["calendars"];
  defaultCalendarId: string | undefined;
  timezone: string;
  locale: string;
  t: ReturnType<typeof useTranslations<"calendar">>;
  onClose: () => void;
  onCreated: () => void;
  onMoreOptions: (draft: QuickCreateDraft) => void;
};

export function QuickCreatePopover(props: QuickCreatePopoverProps) {
  const { open, anchor, day, startMinutes, endMinutes, t, onClose } = props;
  // Close requests are ignored while saving or asking about a conflict.
  const busyRef = useRef(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const virtualAnchor = useMemo(
    () => (anchor ? { getBoundingClientRect: () => anchor } : null),
    [anchor],
  );

  return (
    <PopoverPrimitive.Root
      open={open && anchor !== null}
      onOpenChange={(next) => {
        if (!next && !busyRef.current) onClose();
      }}
    >
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={virtualAnchor}
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={8}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            aria-label={t("quickDialogLabel")}
            data-testid="calendar-quick-create"
            initialFocus={titleRef}
            className="w-80 max-w-[calc(100vw-1rem)] origin-(--transform-origin) rounded-xl bg-popover p-3 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-hidden duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
          >
            <QuickCreateForm
              // A new selection starts from a fresh form.
              key={`${day}-${startMinutes}-${endMinutes}`}
              {...props}
              busyRef={busyRef}
              titleRef={titleRef}
            />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function QuickCreateForm({
  day,
  startMinutes,
  endMinutes,
  calendars,
  defaultCalendarId,
  timezone,
  locale,
  t,
  onClose,
  onCreated,
  onMoreOptions,
  busyRef,
  titleRef,
}: QuickCreatePopoverProps & {
  busyRef: RefObject<boolean>;
  titleRef: RefObject<HTMLInputElement | null>;
}) {
  const router = useRouter();
  const [confirmDialog, confirm] = useCalendarConfirm();
  const writable = calendars.filter(
    (calendar) => calendar.role === "owner" || calendar.role === "editor",
  );
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState(() => minutesToTime(startMinutes));
  const [endTime, setEndTime] = useState(() => minutesToTime(endMinutes));
  const [calendarId, setCalendarId] = useState(
    () =>
      writable.find((calendar) => calendar.id === defaultCalendarId)?.id ??
      writable[0]?.id ??
      "",
  );
  const [saving, setSaving] = useState(false);
  const selectedCalendar = writable.find((calendar) => calendar.id === calendarId);

  function setBusy(value: boolean) {
    busyRef.current = value;
    setSaving(value);
  }

  async function save(allowConflicts = false): Promise<void> {
    if (!title.trim()) {
      toast.error(t("quickTitleRequired"));
      return;
    }
    if (!calendarId) return;
    const input = buildQuickEventInput({
      title,
      day,
      startTime,
      endTime,
      calendarId,
      timezone,
      allowConflicts,
    });
    if (!input) {
      toast.error(t("endAfterStart"));
      return;
    }
    setBusy(true);
    try {
      const result = await upsertCalendarEvent(input);
      if (result.status === "conflict") {
        const confirmed = await confirm({
          title: t("conflictTitle"),
          description: (
            <>
              {t("conflictDescription")}
              <span className="mt-2 block text-xs">
                {result.conflicts
                  .map(
                    (conflict) =>
                      `${conflict.title} · ${new Intl.DateTimeFormat(locale, {
                        timeStyle: "short",
                        timeZone: timezone,
                      }).format(new Date(conflict.startAt))}`,
                  )
                  .join(", ")}
              </span>
            </>
          ),
          confirmLabel: t("saveAnyway"),
        });
        setBusy(false);
        if (confirmed) await save(true);
        return;
      }
      setBusy(false);
      toast.success(t("eventSaved"));
      onCreated();
      router.refresh();
    } catch {
      setBusy(false);
      toast.error(t("quickSaveError"));
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save();
  }

  return (
    <form onSubmit={submit} className="grid gap-3">
      {confirmDialog}
      <div className="flex items-start gap-2">
        <Input
          ref={titleRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("quickTitlePlaceholder")}
          aria-label={t("eventTitle")}
          maxLength={240}
          autoComplete="off"
          disabled={saving}
          className="h-9 text-base font-medium"
        />
        <ShortcutTooltip label={t("quickClose")} keys={<CalendarShortcutKeys shortcuts={["Escape"]} />} hint={t("hintQuickClose")}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("quickClose")}
            onClick={onClose}
            disabled={saving}
          >
            <X />
          </Button>
        </ShortcutTooltip>
      </div>
      <fieldset disabled={saving} className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{formatQuickDay(day, locale)}</span>
        <span aria-hidden className="text-muted-foreground">·</span>
        <div className="flex items-center gap-1 [&_input]:h-8 [&_input]:w-[4.5rem] [&_input]:min-w-0 [&_input]:px-2">
          <AustrianTimeInput
            value={startTime}
            onChange={setStartTime}
            label={t("startTime")}
            invalidMessage={t("invalidTime")}
          />
          <span aria-hidden>–</span>
          <AustrianTimeInput
            value={endTime}
            onChange={setEndTime}
            label={t("endTime")}
            invalidMessage={t("invalidTime")}
          />
        </div>
      </fieldset>
      <label className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: selectedCalendar?.color }}
        />
        <span className="sr-only">{t("calendarLabel")}</span>
        <select
          className="h-8 min-w-0 flex-1 rounded-lg border bg-background px-2.5 text-sm"
          value={calendarId}
          onChange={(event) => setCalendarId(event.target.value)}
          disabled={saving}
        >
          {writable.map((calendar) => (
            <option value={calendar.id} key={calendar.id}>
              {calendar.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center justify-between gap-2">
        <ShortcutTooltip label={t("quickMoreOptions")} hint={t("hintQuickMore")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => onMoreOptions({ title, day, startTime, endTime, calendarId })}
          >
            {t("quickMoreOptions")}
          </Button>
        </ShortcutTooltip>
        <ShortcutTooltip label={t("quickSave")} keys={<CalendarShortcutKeys shortcuts={["Enter"]} />} hint={t("hintQuickSave")}>
          <Button type="submit" size="sm" disabled={saving || !calendarId}>
            {t("quickSave")}
          </Button>
        </ShortcutTooltip>
      </div>
    </form>
  );
}
