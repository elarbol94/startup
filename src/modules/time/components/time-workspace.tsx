"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import type { TimeWorkspaceData } from "../queries";
import { EntryDialog, type EntryDialogState } from "./time-workspace/entry-dialog";
import { SummaryCards } from "./time-workspace/summary-cards";
import { TimerCard } from "./time-workspace/timer-card";
import { WeekView } from "./time-workspace/week-view";

export function TimeWorkspace({ data, presetProjectId = "" }: { data: TimeWorkspaceData; presetProjectId?: string }) {
  const t = useTranslations("time");
  const [dialog, setDialog] = useState<EntryDialogState>(null);
  const options = { projects: data.projects, tasks: data.tasks };

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader title={t("title")} description={t("subtitle")} />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <TimerCard running={data.running} options={options} serverNow={data.now} presetProjectId={presetProjectId} />
          <WeekView
            weekStart={data.weekStart}
            today={data.today}
            days={data.week.days}
            entries={data.entries}
            now={data.now}
            onCreate={(date) => setDialog({ mode: "create", date, projectId: presetProjectId })}
            onEdit={(entry) => setDialog({ mode: "edit", entry })}
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <SummaryCards week={data.week} month={data.monthSummary} monthKey={data.month} />
          {!data.week.hasContract && (
            <p className="flex items-start gap-2.5 rounded-[10px] border border-dashed border-line-strong px-3.5 py-2.5 text-[13px] text-text-secondary">
              <Info className="mt-px size-[15px] shrink-0" />
              {t("summary.noContract")}
            </p>
          )}
        </div>
      </div>

      <EntryDialog state={dialog} onClose={() => setDialog(null)} options={options} />
    </div>
  );
}
