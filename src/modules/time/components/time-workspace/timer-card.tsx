"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TimeEntryView } from "../../queries";
import { startTimer, stopTimer, updateRunningTimer } from "../../timer-actions";
import { assignmentPayload, emptyAssignment, type Assignment, type WorkOptions } from "./time-types";
import { clockInVienna, formatElapsed } from "./time-utils";
import { useTimeAction } from "./use-time-action";
import { WorkFields } from "./work-fields";

function fromEntry(entry: TimeEntryView | null): Assignment {
  if (!entry) return emptyAssignment;
  return { projectId: entry.projectId ?? "", taskId: entry.taskId ?? "", kind: entry.kind, note: entry.note };
}

export function TimerCard({
  running,
  options,
  serverNow,
}: {
  running: TimeEntryView | null;
  options: WorkOptions;
  /** Render time from the server, so the first client render hydrates identically. */
  serverNow: number;
}) {
  const t = useTranslations("time");
  const { pending, run } = useTimeAction();
  const [assignment, setAssignment] = useState<Assignment>(() => fromEntry(running));
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [now, setNow] = useState(serverNow);
  const runningId = running?.id ?? null;

  // Re-sync the form when a timer starts or stops (also from another tab).
  const [syncedId, setSyncedId] = useState(runningId);
  if (syncedId !== runningId) {
    setSyncedId(runningId);
    setAssignment(fromEntry(running));
    setBreakMinutes("0");
  }

  useEffect(() => {
    if (!runningId) return;
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [runningId]);

  const dirty =
    running !== null &&
    (assignment.projectId !== (running.projectId ?? "") ||
      assignment.taskId !== (running.taskId ?? "") ||
      assignment.kind !== running.kind ||
      assignment.note !== running.note);

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t("timer.title")}</p>
          <p className="mt-1 font-mono text-3xl font-semibold tabular-nums" aria-live="off">
            {running ? formatElapsed(now - running.startedAt) : "0:00:00"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {running ? t("timer.running", { time: clockInVienna(running.startedAt) }) : t("timer.idle")}
          </p>
        </div>
        {running ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-28 space-y-1.5">
              <Label htmlFor="timer-break">{t("fields.break")}</Label>
              <Input
                id="timer-break"
                type="number"
                min={0}
                max={1440}
                inputMode="numeric"
                value={breakMinutes}
                onChange={(event) => setBreakMinutes(event.target.value)}
              />
            </div>
            <Button
              size="lg"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                run(
                  () => stopTimer({ breakMinutes: Number(breakMinutes) || 0 }),
                  (result) => toast.success(result.discarded ? t("timer.discardedToast") : t("timer.stoppedToast")),
                )
              }
            >
              <Square className="size-4" />
              {t("timer.stop")}
            </Button>
          </div>
        ) : (
          <Button
            size="lg"
            disabled={pending}
            onClick={() => run(() => startTimer(assignmentPayload(assignment)), () => toast.success(t("timer.startedToast")))}
          >
            <Play className="size-4" />
            {t("timer.start")}
          </Button>
        )}
      </div>
      <div className="mt-4 border-t pt-4">
        <WorkFields value={assignment} onChange={setAssignment} options={options} disabled={pending} />
        {dirty && (
          <div className="mt-3 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => run(() => updateRunningTimer(assignmentPayload(assignment)), () => toast.success(t("timer.bookingUpdated")))}
            >
              {t("timer.updateBooking")}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
