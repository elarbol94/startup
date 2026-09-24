"use client";

// Dialog for creating or editing a calendar (name, color, visibility).
// Used by calendar-client.tsx.
import { type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { ColorPicker } from "@/components/ui/color-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CalendarDraft } from "./calendar-types";

export function CalendarSettingsDialog({
  open,
  onOpenChange,
  draft,
  setDraft,
  onSubmit,
  pending,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: CalendarDraft;
  setDraft: (draft: CalendarDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pending: boolean;
  t: ReturnType<typeof useTranslations<"calendar">>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>{draft.id ? t("editCalendar") : t("addCalendar")}</DialogTitle>
            <DialogDescription>{t("calendarVisibilityDescription")}</DialogDescription>
          </DialogHeader>
          <div className="mt-5 grid gap-4">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium">{t("calendarName")}</span>
              <Input
                required
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder={t("calendarNamePlaceholder")}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium">{t("calendarColor")}</span>
              <ColorPicker
                aria-label={t("calendarColor")}
                value={draft.color}
                onChange={(color) => setDraft({ ...draft, color })}
                className="h-9 w-20 p-1"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium">{t("calendarVisibility")}</span>
              <select
                className="h-9 rounded-lg border bg-background px-2.5 text-sm"
                value={draft.visibility}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    visibility: event.target.value as CalendarDraft["visibility"],
                  })
                }
              >
                <option value="private">{t("calendarPrivate")}</option>
                <option value="busy">{t("calendarBusyOnly")}</option>
                <option value="company">{t("calendarShared")}</option>
              </select>
            </label>
          </div>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {t("saveCalendar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
