"use client";

import { useTranslations } from "next-intl";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { UserIdentity } from "@/components/user-identity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TaskPriority, TaskStatus } from "../../types";

export type TaskFilterState = {
  assignee: string;
  priority: string;
  status: string;
  project: string;
  search: string;
};

/** Everything beyond "Meine | Alle": search, project, person, priority and (in the list) status. */
export function TaskFilterMenu({
  filters,
  activeCount,
  members,
  projects,
  showStatus,
  onChange,
  onReset,
}: {
  filters: TaskFilterState;
  activeCount: number;
  members: Array<{ id: string; name: string }>;
  projects: Array<{ id: string; name: string }>;
  showStatus: boolean;
  onChange: (key: keyof TaskFilterState, value: string) => void;
  onReset: () => void;
}) {
  const t = useTranslations("tasks");
  const assigneeLabel = filters.assignee === "all"
    ? t("allUsers")
    : filters.assignee === "unassigned"
      ? t("unassigned")
      : members.find((member) => member.id === filters.assignee)?.name ?? t("allUsers");

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline" size="sm" aria-label={t("filter")} />}>
        <SlidersHorizontal />
        {t("filter")}
        {activeCount > 0 && (
          <span className="grid min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] text-brand-on tabular-nums">{activeCount}</span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-3 p-3">
        <PopoverHeader>
          <PopoverTitle>{t("filter")}</PopoverTitle>
        </PopoverHeader>
        <Input value={filters.search} onChange={(event) => onChange("search", event.target.value)} aria-label={t("board.search")} placeholder={t("board.search")} />
        <Select value={filters.project} onValueChange={(value) => onChange("project", value ?? "all")}>
          <SelectTrigger className="w-full" aria-label={t("board.project")}>
            <SelectValue>{filters.project === "all" ? t("board.allProjects") : filters.project === "none" ? t("board.noProject") : projects.find((project) => project.id === filters.project)?.name}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("board.allProjects")}</SelectItem>
            <SelectItem value="none">{t("board.noProject")}</SelectItem>
            {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.assignee} onValueChange={(value) => onChange("assignee", value ?? "all")}>
          <SelectTrigger className="w-full" aria-label={t("filterAssignee")}>
            <SelectValue>{!["all", "unassigned"].includes(filters.assignee) ? <UserIdentity userId={filters.assignee} name={assigneeLabel} compact /> : assigneeLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allUsers")}</SelectItem>
            <SelectItem value="unassigned">{t("unassigned")}</SelectItem>
            {members.map((member) => <SelectItem key={member.id} value={member.id}><UserIdentity userId={member.id} name={member.name} /></SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.priority} onValueChange={(value) => onChange("priority", value ?? "all")}>
          <SelectTrigger className="w-full" aria-label={t("filterPriority")}>
            <SelectValue>{filters.priority === "all" ? t("allPriorities") : t(`priorities.${filters.priority as TaskPriority}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allPriorities")}</SelectItem>
            <SelectItem value="high">{t("priorities.high")}</SelectItem>
            <SelectItem value="medium">{t("priorities.medium")}</SelectItem>
            <SelectItem value="low">{t("priorities.low")}</SelectItem>
          </SelectContent>
        </Select>
        {showStatus && (
          <Select value={filters.status} onValueChange={(value) => onChange("status", value ?? "open")}>
            <SelectTrigger className="w-full" aria-label={t("filterStatus")}>
              <SelectValue>{t(`statuses.${filters.status as TaskStatus | "all"}`)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">{t("statuses.open")}</SelectItem>
              <SelectItem value="done">{t("statuses.done")}</SelectItem>
              <SelectItem value="all">{t("statuses.all")}</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Button variant="ghost" size="sm" className="justify-start" onClick={onReset}>
          <RotateCcw />
          {t("resetFilters")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
