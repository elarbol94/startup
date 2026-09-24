"use client";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarClock, ClipboardPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
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
    <PageHeader
      className="mb-0"
      eyebrow={t("title")}
      title={t("welcome", { name: userName })}
      description={<>{format.dateTime(now, { weekday: "long", day: "numeric", month: "long" })} · {t("workDescription")}</>}
      actions={<>
        <Button onClick={() => openTaskCreator()}>
          <ClipboardPlus />
          {tTasks("createTask")}
        </Button>
        <Button variant="outline" onClick={() => openDeadlineCreator()}>
          <CalendarClock />
          {tDeadlines("createDeadline")}
        </Button>
      </>}
    />
  );
}
