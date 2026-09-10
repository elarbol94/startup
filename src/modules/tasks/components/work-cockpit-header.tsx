"use client";
import { UserIdentity } from "@/components/user-identity";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarClock, ClipboardPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDeadlineCreator } from "./deadline-create-provider";
import { useTaskCreator } from "./task-create-provider";
export function WorkCockpitHeader({ userName }: { userName: string }) {
  const t = useTranslations("dashboard");
  const tTasks = useTranslations("tasks");
  const tDeadlines = useTranslations("deadlines");
  const format = useFormatter();
  const { openTaskCreator } = useTaskCreator();
  const { openDeadlineCreator } = useDeadlineCreator();
  const [now] = useState(() => new Date());
  return (
    <section>
      <div className="flex flex-col gap-5 py-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{t("title")} <span aria-hidden="true" className="mx-2 opacity-40">/</span> <span className="font-normal normal-case tracking-normal">{format.dateTime(now, { weekday: "long", day: "numeric", month: "long" })}</span></p>
          <h1 className="mt-3 break-words text-3xl font-semibold tracking-[-0.04em] sm:text-4xl"><UserIdentity name={userName} avatarOnly /> {t("welcome", { name: userName })}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t("workDescription")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" className="rounded-xl bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-400" onClick={() => openTaskCreator()}>
            <ClipboardPlus />
            {tTasks("createTask")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="rounded-xl bg-card"
            onClick={() => openDeadlineCreator()}
          >
            <CalendarClock />
            {tDeadlines("createDeadline")}
          </Button>
        </div>
      </div>

    </section>
  );
}
