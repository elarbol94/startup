"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import type { TimeWorkspaceData } from "../queries";
import { EntryDialog, type EntryDialogState } from "./time-workspace/entry-dialog";
import { SummaryCards } from "./time-workspace/summary-cards";
import { TimerCard } from "./time-workspace/timer-card";
import { selectClassName, timeHref } from "./time-workspace/time-utils";
import { WeekView } from "./time-workspace/week-view";

export function TimeWorkspace({ data }: { data: TimeWorkspaceData }) {
  const t = useTranslations("time");
  const router = useRouter();
  const [dialog, setDialog] = useState<EntryDialogState>(null);
  const options = { projects: data.projects, tasks: data.tasks };
  const userParam = data.isOwn ? null : data.subject.id;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{data.isOwn ? t("title") : t("viewing", { name: data.subject.name })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        {data.canManage && (
          <div className="w-56 space-y-1.5">
            <Label htmlFor="time-person">{t("person")}</Label>
            <select
              id="time-person"
              className={selectClassName}
              value={data.subject.id}
              onChange={(event) => router.push(timeHref({ week: data.weekStart, user: event.target.value }))}
            >
              {data.people.map((person) => (
                <option key={person.id} value={person.id}>{person.name}</option>
              ))}
            </select>
          </div>
        )}
      </header>

      {data.isOwn && <TimerCard running={data.running} options={options} serverNow={data.now} />}

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
        userParam={userParam}
        now={data.now}
        onCreate={(date) => setDialog({ mode: "create", date })}
        onEdit={(entry) => setDialog({ mode: "edit", entry })}
      />

      <EntryDialog state={dialog} onClose={() => setDialog(null)} userId={data.subject.id} options={options} />
    </div>
  );
}
