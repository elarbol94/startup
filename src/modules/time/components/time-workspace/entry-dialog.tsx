"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import type { TimeEntryView } from "../../queries";
import { deleteTimeEntry, saveTimeEntry } from "../../entry-actions";
import { assignmentPayload, type Assignment, type WorkOptions } from "./time-types";
import { clockInVienna } from "./time-utils";
import { useTimeAction } from "./use-time-action";
import { WorkFields } from "./work-fields";

export type EntryDialogState =
  | { mode: "create"; date: string }
  | { mode: "edit"; entry: TimeEntryView }
  | null;

type FormState = Assignment & { workDate: string; start: string; end: string; breakMinutes: string };

function initialForm(state: NonNullable<EntryDialogState>): FormState {
  if (state.mode === "create") {
    return { workDate: state.date, start: "09:00", end: "17:00", breakMinutes: "30", projectId: "", taskId: "", kind: "work", note: "" };
  }
  const { entry } = state;
  return {
    workDate: entry.workDate,
    start: clockInVienna(entry.startedAt),
    end: entry.endedAt ? clockInVienna(entry.endedAt) : "",
    breakMinutes: String(entry.breakMinutes),
    projectId: entry.projectId ?? "",
    taskId: entry.taskId ?? "",
    kind: entry.kind,
    note: entry.note,
  };
}

export function EntryDialog({
  state,
  onClose,
  options,
}: {
  state: EntryDialogState;
  onClose: () => void;
  options: WorkOptions;
}) {
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      {state && (
        <EntryForm
          key={state.mode === "edit" ? state.entry.id : `new-${state.date}`}
          state={state}
          onClose={onClose}
          options={options}
        />
      )}
    </Dialog>
  );
}

function EntryForm({
  state,
  onClose,
  options,
}: {
  state: NonNullable<EntryDialogState>;
  onClose: () => void;
  options: WorkOptions;
}) {
  const t = useTranslations("time");
  const { pending, run } = useTimeAction();
  const [form, setForm] = useState<FormState>(() => initialForm(state));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editing = state.mode === "edit" ? state.entry : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    run(
      () =>
        saveTimeEntry({
          id: editing?.id,
          workDate: form.workDate,
          start: form.start,
          end: form.end,
          breakMinutes: Number(form.breakMinutes) || 0,
          ...assignmentPayload(form),
        }),
      () => {
        toast.success(t("entry.saved"));
        onClose();
      },
    );
  }

  function remove() {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    run(() => deleteTimeEntry(editing.id), () => {
      toast.success(t("entry.deleted"));
      onClose();
    });
  }

  return (
    <DialogContent className="sm:max-w-xl">
      <form onSubmit={submit} className="space-y-4">
        <DialogHeader>
          <DialogTitle>{editing ? t("entry.editTitle") : t("entry.createTitle")}</DialogTitle>
          <DialogDescription>{t("entry.description")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-1">
            <Label htmlFor="entry-date">{t("fields.date")}</Label>
            <Input id="entry-date" type="date" required value={form.workDate} onChange={(event) => setForm({ ...form, workDate: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entry-start">{t("fields.start")}</Label>
            <Input id="entry-start" type="time" required value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entry-end">{t("fields.end")}</Label>
            <Input id="entry-end" type="time" required value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="entry-break">{t("fields.break")}</Label>
            <Input id="entry-break" type="number" min={0} max={1440} inputMode="numeric" value={form.breakMinutes} onChange={(event) => setForm({ ...form, breakMinutes: event.target.value })} />
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">{t("fields.overnightHint")}</p>
        <WorkFields value={form} onChange={(next) => setForm({ ...form, ...next })} options={options} disabled={pending} />
        <DialogFooter className="gap-2">
          {editing && (
            <Button type="button" variant="destructive" disabled={pending} onClick={remove} className="sm:mr-auto">
              {confirmDelete ? t("entry.confirmDelete") : t("entry.delete")}
            </Button>
          )}
          <Button type="submit" disabled={pending}>{t("entry.save")}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
