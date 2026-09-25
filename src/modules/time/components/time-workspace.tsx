"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import type { TimeWorkspaceData } from "../queries";
import { EntryDialog, type EntryDialogState } from "./time-workspace/entry-dialog";
import { SummaryCards } from "./time-workspace/summary-cards";
import { TimerCard } from "./time-workspace/timer-card";
import { WeekView } from "./time-workspace/week-view";

export function TimeWorkspace({ data }: { data: TimeWorkspaceData }) {
  const t = useTranslations("time");
  const [dialog, setDialog] = useState<EntryDialogState>(null);
  const options = { projects: data.projects, tasks: data.tasks };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </header>

      <TimerCard running={data.running} options={options} serverNow={data.now} />

      {!data.week.hasContract && (
        <p className="flex items-start gap-2 rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          {t("summary.noContract")}
        </p>
      )}
      <SummaryCards week={data.week} month={data.monthSummary} monthKey={data.month} />

      <WeekView
        weekStart={data.weekStart}
        today={data.today}
        days={data.week.days}
        entries={data.entries}
        now={data.now}
        onCreate={(date) => setDialog({ mode: "create", date })}
        onEdit={(entry) => setDialog({ mode: "edit", entry })}
      />

      <EntryDialog state={dialog} onClose={() => setDialog(null)} options={options} />
    </div>
  );
}
