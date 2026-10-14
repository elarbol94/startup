"use client";
import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { CalendarClock, Check, ClipboardPlus, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { useDeadlineCreator } from "./deadline-create-provider";
import { useOverviewEditing } from "./overview-preferences";
import { useTaskCreator } from "./task-create-provider";

export function WorkCockpitHeader({ userName }: { userName: string }) {
  const t = useTranslations("dashboard");
  const tTasks = useTranslations("tasks");
  const tDeadlines = useTranslations("deadlines");
  const tLayout = useTranslations("overviewLayout");
  const format = useFormatter();
  const { openTaskCreator } = useTaskCreator();
  const { openDeadlineCreator } = useDeadlineCreator();
  const { editing, setEditing } = useOverviewEditing();
  const [now] = useState(() => new Date());
  return (
    <PageHeader
      className="mb-0"
      eyebrow={format.dateTime(now, { weekday: "long", day: "numeric", month: "long" })}
      title={t("welcome", { name: userName })}
      actions={<>
        <Button onClick={() => openTaskCreator()}>
          <ClipboardPlus />
          {tTasks("createTask")}
        </Button>
        <Button variant="outline" onClick={() => openDeadlineCreator()}>
          <CalendarClock />
          {tDeadlines("createDeadline")}
        </Button>
        <Button
          variant={editing ? "secondary" : "ghost"}
          size={editing ? "default" : "icon"}
          aria-pressed={editing}
          aria-label={editing ? undefined : tLayout("customize")}
          title={editing ? undefined : tLayout("customize")}
          onClick={() => setEditing(!editing)}
        >
          {editing ? <><Check />{tLayout("done")}</> : <LayoutGrid />}
        </Button>
      </>}
    />
  );
}
