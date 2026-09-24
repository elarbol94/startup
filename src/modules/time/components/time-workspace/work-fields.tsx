"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { timeEntryKinds, type TimeEntryKind } from "../../constants";
import type { Assignment, WorkOptions } from "./time-types";
import { selectClassName } from "./time-utils";

/** Project → task → type → note, shared by the timer and the entry dialog. */
export function WorkFields({
  value,
  onChange,
  options,
  disabled,
}: {
  value: Assignment;
  onChange: (next: Assignment) => void;
  options: WorkOptions;
  disabled?: boolean;
}) {
  const t = useTranslations("time");
  const id = useId();
  const tasks = value.projectId ? options.tasks.filter((task) => task.projectId === value.projectId) : [];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-project`}>{t("fields.project")}</Label>
        <select
          id={`${id}-project`}
          className={selectClassName}
          value={value.projectId}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, projectId: event.target.value, taskId: "" })}
        >
          <option value="">{t("fields.noProject")}</option>
          {options.projects.map((project) => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-task`}>{t("fields.task")}</Label>
        <select
          id={`${id}-task`}
          className={selectClassName}
          value={value.taskId}
          disabled={disabled || !tasks.length}
          onChange={(event) => onChange({ ...value, taskId: event.target.value })}
        >
          <option value="">{t("fields.noTask")}</option>
          {tasks.map((task) => (
            <option key={task.id} value={task.id}>{task.title}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-kind`}>{t("fields.kind")}</Label>
        <select
          id={`${id}-kind`}
          className={selectClassName}
          value={value.kind}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, kind: event.target.value as TimeEntryKind })}
        >
          {timeEntryKinds.map((kind) => (
            <option key={kind} value={kind}>{t(`kinds.${kind}`)}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-note`}>{t("fields.note")}</Label>
        <Input
          id={`${id}-note`}
          value={value.note}
          maxLength={1000}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, note: event.target.value })}
        />
      </div>
    </div>
  );
}
