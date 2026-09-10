"use client";

import { OverviewTable, OverviewColumnPicker, useOverviewTable } from "./overview-table";
import { UserIdentity } from "@/components/user-identity";
import { DeadlineDetails } from "./deadline-details";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  CalendarClock,
  Check,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { setTaskStatus } from "@/modules/projects/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deadlineEditOptions,
  isDeadlineOverdue,
} from "../deadline-utils";
import { useDeadlineCreator } from "./deadline-create-provider";
import type { TaskStatus } from "../types";

type OverviewDeadline = {
  id: string;
  title: string;
  description: string;
  assigneeId: string | null;
  assigneeName: string | null;
  deadlineDate: string;
  deadlineAt: string | null;
  status: TaskStatus;
  contextType: "wikiPage" | "wikiSource" | "pdf" | "app" | null;
  contextEntityId: string | null;
  contextRoute: string | null;
  contextLabel: string | null;
  contextAnchorJson: string | null;
  href: string;
};

function localDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function DeadlineOverview({
  deadlines,
  members,
  filters,
  defaultAssignee,
}: {
  deadlines: OverviewDeadline[];
  members: Array<{ id: string; name: string }>;
  filters: { assignee: string; from: string; to: string; status: string };
  defaultAssignee: string;
}) {
  const t = useTranslations("deadlines");
  const format = useFormatter();
  const layoutT = useTranslations("overviewLayout");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openDeadlineCreator } = useDeadlineCreator();
  const [pending, startTransition] = useTransition();
  const [now] = useState(() => new Date());
  const assigneeLabel = filters.assignee === "all"
    ? t("allUsers")
    : filters.assignee === "unassigned"
      ? t("unassigned")
      : members.find((member) => member.id === filters.assignee)?.name ?? t("allUsers");
  const statusLabel = t(`statuses.${filters.status as TaskStatus | "all"}`);
  const adjustedFilterCount = Number(filters.assignee !== defaultAssignee)
    + Number(Boolean(filters.from))
    + Number(Boolean(filters.to))
    + Number(filters.status !== "open");

  function replaceFilters(update: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(searchParams.toString());
    update(next);
    startTransition(() => {
      router.replace(`/?${next.toString()}`, { scroll: false });
    });
  }

  function setFilter(
    key: "deadlineAssignee" | "deadlineFrom" | "deadlineTo" | "deadlineStatus",
    value: string,
  ) {
    replaceFilters((next) => {
      const isDefault = (key === "deadlineAssignee" && value === defaultAssignee)
        || (key === "deadlineStatus" && value === "open")
        || ((key === "deadlineFrom" || key === "deadlineTo") && !value);
      if (isDefault) next.delete(key);
      else next.set(key, value);
    });
  }

  function resetFilters() {
    replaceFilters((next) => {
      next.delete("deadlineAssignee");
      next.delete("deadlineFrom");
      next.delete("deadlineTo");
      next.delete("deadlineStatus");
    });
  }

  function editDeadline(deadline: OverviewDeadline) {
    openDeadlineCreator(deadlineEditOptions(deadline, t("origins.app")));
  }

  function toggle(deadline: OverviewDeadline) {
    startTransition(async () => {
      await setTaskStatus(deadline.id, deadline.status === "done" ? "open" : "done");
      router.refresh();
    });
  }

  const table = useOverviewTable("deadlines", deadlines, [
    { id: "title", label: t("title"), width: 220, value: deadline => deadline.title, render: deadline => <DeadlineDetails deadline={deadline} className="block w-full rounded text-sm font-medium"><span className={`block truncate ${deadline.status === "done" ? "text-muted-foreground line-through" : ""}`}>{deadline.title}</span></DeadlineDetails> },
    { id: "origin", label: layoutT("origin"), value: deadline => deadline.contextLabel || t("origins.app") },
    { id: "assignee", label: t("assignee"), value: deadline => deadline.assigneeName, render: deadline => <UserIdentity userId={deadline.assigneeId} name={deadline.assigneeName || t("unassigned")} compact /> },
    { id: "date", label: t("dateTime"), width: 185, value: deadline => deadline.deadlineAt ? Date.parse(deadline.deadlineAt) : new Date(`${deadline.deadlineDate}T23:59:59`).getTime(), render: deadline => <span className={`text-xs ${isDeadlineOverdue(deadline, now) ? "text-destructive" : "text-muted-foreground"}`}>{format.dateTime(localDate(deadline.deadlineDate), { dateStyle: "medium" })} · {deadline.deadlineAt ? format.dateTime(new Date(deadline.deadlineAt), { timeStyle: "short" }) : t("allDay")}</span> },
    { id: "status", label: t("status"), width: 115, value: deadline => deadline.status === "done" ? 1 : 0, render: deadline => <Badge variant={isDeadlineOverdue(deadline, now) ? "destructive" : "outline"}>{isDeadlineOverdue(deadline, now) ? t("overdue") : t(`statuses.${deadline.status}`)}</Badge> },
  ], "deadlineSort");

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-card">
      <header className="border-b border-border/70 px-4 py-5 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              <CalendarClock className="size-4.5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold tracking-tight">{t("overview")}</h2>
                <Badge variant="secondary" className="font-mono tabular-nums">{deadlines.length}</Badge>
              </div>

            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" aria-label={t("filter")} />}>
              <SlidersHorizontal />
              {t("filter")}
              {adjustedFilterCount > 0 && (
                <span className="grid min-w-4 place-items-center rounded-full bg-amber-600 px-1 text-[10px] text-white">{adjustedFilterCount}</span>
              )}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 gap-3 p-3">
              <PopoverHeader><PopoverTitle>{t("filter")}</PopoverTitle></PopoverHeader>
              <Select value={filters.assignee} onValueChange={(value) => setFilter("deadlineAssignee", value ?? "all")}>
                <SelectTrigger className="w-full" aria-label={t("filterAssignee")}><SelectValue>{!["all", "unassigned"].includes(filters.assignee) ? <UserIdentity userId={filters.assignee} name={assigneeLabel} compact /> : assigneeLabel}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allUsers")}</SelectItem>
                  <SelectItem value="unassigned">{t("unassigned")}</SelectItem>
                  {members.map((member) => <SelectItem key={member.id} value={member.id}><UserIdentity userId={member.id} name={member.name} /></SelectItem>)}
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={filters.from}
                  aria-label={t("filterFrom")}
                  title={t("filterFrom")}
                  onChange={(event) => setFilter("deadlineFrom", event.target.value)}
                />
                <Input
                  type="date"
                  value={filters.to}
                  min={filters.from || undefined}
                  aria-label={t("filterTo")}
                  title={t("filterTo")}
                  onChange={(event) => setFilter("deadlineTo", event.target.value)}
                />
              </div>
              <Select value={filters.status} onValueChange={(value) => setFilter("deadlineStatus", value ?? "open")}>
                <SelectTrigger className="w-full" aria-label={t("filterStatus")}><SelectValue>{statusLabel}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{t("statuses.open")}</SelectItem>
                  <SelectItem value="done">{t("statuses.done")}</SelectItem>
                  <SelectItem value="all">{t("statuses.all")}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="sm" className="justify-start" onClick={resetFilters}>
                <RotateCcw />
                {t("resetFilters")}
              </Button>
            </PopoverContent>
          </Popover>

          <button type="button" onClick={() => setFilter("deadlineAssignee", "all")} className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            {!["all", "unassigned"].includes(filters.assignee) ? <UserIdentity userId={filters.assignee} name={assigneeLabel} compact /> : assigneeLabel}<X className="size-3" />
          </button>
          {filters.from && (
            <button type="button" onClick={() => setFilter("deadlineFrom", "")} className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground">
              {t("filterFrom")}: {filters.from}<X className="size-3" />
            </button>
          )}
          {filters.to && (
            <button type="button" onClick={() => setFilter("deadlineTo", "")} className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground">
              {t("filterTo")}: {filters.to}<X className="size-3" />
            </button>
          )}
          <button type="button" onClick={() => setFilter("deadlineStatus", "all")} className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            {statusLabel}<X className="size-3" />
          </button>
          <OverviewColumnPicker table={table} />
        </div>
      </header>

      <OverviewTable table={table} label={t("overview")} pending={pending} empty={<div><p>{t("empty")}</p><div className="mt-4 flex flex-wrap justify-center gap-2"><Button variant="outline" size="sm" onClick={resetFilters}>{t("resetFilters")}</Button><Button size="sm" onClick={() => openDeadlineCreator()}>{t("createDeadline")}</Button></div></div>} actions={deadline => (
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("edit")} />}><MoreHorizontal /></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => editDeadline(deadline)}><Pencil />{t("edit")}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggle(deadline)}>
                          {deadline.status === "done" ? <RotateCcw /> : <Check />}
                          {deadline.status === "done" ? t("reopen") : t("markDone")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
      )} />
    </section>
  );
}
