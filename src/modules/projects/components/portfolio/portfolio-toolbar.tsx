// Portfolio page chrome above the Gantt: the title header with portfolio stats and the
// timeline toolbar (view switch, search, filters, zoom and line controls). Used by portfolio-client.tsx.
"use client";

import { UserIdentity } from "@/components/user-identity";

import { useFormatter, useTranslations } from "next-intl";
import {
  CalendarClock,
  CircleHelp,
  FolderKanban,
  Focus,
  GitBranch,
  LocateFixed,
  Minimize2,
  Plus,
  Search,
  WandSparkles,
} from "lucide-react";
import type {
  PortfolioSchedule,
  PortfolioTask,
} from "@/modules/projects/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { isTaskDone } from "@/modules/projects/schedule";
import type { ProjectDialogState } from "../project-dialog";
import type { EmbeddedProjectPlanner, SetState, Zoom } from "./portfolio-types";
import { parseDate, projectRisk } from "./portfolio-utils";
import type { usePortfolioFocus } from "./use-portfolio-focus";
import type { usePortfolioRows } from "./use-portfolio-rows";
import type { useStructureDrag } from "./use-structure-drag";
import type { useTaskTreeActions } from "./use-task-tree-actions";
import type { useTimelineLayout } from "./use-timeline-layout";

export function PortfolioHeader({
  schedule,
  tasksByProject,
  today,
  setProjectDialog,
}: {
  schedule: PortfolioSchedule;
  tasksByProject: Map<string, PortfolioTask[]>;
  today: string;
  setProjectDialog: SetState<ProjectDialogState>;
}) {
  const t = useTranslations("projects");
  const format = useFormatter();
  const nextMilestone = schedule.tasks
    .filter((task) => task.isMilestone && task.dueDate && task.dueDate >= today && !isTaskDone(task))
    .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0];
  const riskCount = schedule.projects.filter((project) =>
    projectRisk(project, tasksByProject.get(project.id) ?? [], today),
  ).length;
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span>{t("activeProjectCount", { count: schedule.projects.length })}</span>
          <span aria-hidden>·</span>
          <span className={cn(riskCount > 0 && "text-amber-700 dark:text-amber-400")}>{t("riskProjectCount", { count: riskCount })}</span>
          {nextMilestone?.dueDate && (
            <>
              <span aria-hidden>·</span>
              <span>{t("nextMilestone")}: {format.dateTime(parseDate(nextMilestone.dueDate), { day: "2-digit", month: "short" })}</span>
            </>
          )}
        </div>
      </div>
      <Button size="sm" onClick={() => setProjectDialog({ kind: "create" })}><Plus className="size-4" />{t("newProject")}</Button>
    </header>
  );
}

export function TimelineToolbar({
  embedded,
  view,
  setView,
  query,
  setQuery,
  searchResults,
  revealProject,
  enterTaskFocus,
  schedule,
  owner,
  setOwner,
  health,
  setHealth,
  zoom,
  setTimelineZoom,
  fitTimelineView,
  scrollToToday,
  criticalVisible,
  setCriticalVisible,
  structurePending,
  tidyDependencyLines,
  linesVisible,
  setLinesVisible,
  structureDrag,
  structureDrop,
}: Pick<ReturnType<typeof usePortfolioRows>, "searchResults"> &
  Pick<ReturnType<typeof useTaskTreeActions>, "revealProject"> &
  Pick<ReturnType<typeof usePortfolioFocus>, "enterTaskFocus"> &
  Pick<ReturnType<typeof useTimelineLayout>, "fitTimelineView" | "scrollToToday"> &
  Pick<
    ReturnType<typeof useStructureDrag>,
    "tidyDependencyLines" | "structureDrag" | "structureDrop"
  > & {
    structurePending: boolean;
    embedded?: EmbeddedProjectPlanner;
    view: "timeline" | "projects";
    setView: SetState<"timeline" | "projects">;
    query: string;
    setQuery: SetState<string>;
    schedule: PortfolioSchedule;
    owner: string;
    setOwner: SetState<string>;
    health: "all" | "risk" | "track";
    setHealth: SetState<"all" | "risk" | "track">;
    zoom: Zoom;
    setTimelineZoom: (nextZoom: Zoom) => void;
    criticalVisible: boolean;
    setCriticalVisible: SetState<boolean>;
    linesVisible: boolean;
    setLinesVisible: SetState<boolean>;
  }) {
  const t = useTranslations("projects");
  return (
    <div className="flex flex-wrap items-center gap-2 border-b pb-3">
      {!embedded && <div className="flex w-full gap-1 border-b pb-3">
        <Button size="sm" variant={view === "timeline" ? "secondary" : "ghost"} onClick={() => setView("timeline")}><CalendarClock className="size-4" />{t("timeline")}</Button>
        <Button size="sm" variant={view === "projects" ? "secondary" : "ghost"} onClick={() => setView("projects")}><FolderKanban className="size-4" />{t("projectOverview")}</Button>
      </div>}
      {view === "timeline" && (
        <>
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchSchedule")}
              className="pl-8"
              role="combobox"
              aria-expanded={Boolean(query.trim())}
              aria-controls="schedule-search-results"
            />
            {query.trim() && (
              <div
                id="schedule-search-results"
                className="absolute top-[calc(100%+0.35rem)] left-0 z-50 w-full min-w-72 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
                role="listbox"
              >
                {searchResults.projects.length > 0 && (
                  <>
                    <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {t("projectsGroup")}
                    </p>
                    {searchResults.projects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        role="option"
                        aria-selected={false}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                        onClick={() => revealProject(project.id)}
                      >
                        <span className="size-2 rounded-full" style={{ backgroundColor: project.color }} />
                        <span className="truncate">{project.name}</span>
                      </button>
                    ))}
                  </>
                )}
                {searchResults.tasks.length > 0 && (
                  <>
                    <p className="mt-1 border-t px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                      {t("tasksGroup")}
                    </p>
                    {searchResults.tasks.map((task) => {
                      const project = schedule.projects.find((candidate) => candidate.id === task.projectId);
                      return (
                        <button
                          key={task.id}
                          type="button"
                          role="option"
                          aria-selected={false}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                          onClick={() => {
                            setQuery("");
                            enterTaskFocus(task);
                          }}
                        >
                          <Focus className="size-3.5 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{task.title}</span>
                          <span className="max-w-24 truncate text-[10px] text-muted-foreground">{project?.name}</span>
                        </button>
                      );
                    })}
                  </>
                )}
                {searchResults.projects.length === 0 && searchResults.tasks.length === 0 && (
                  <p className="px-2 py-5 text-center text-xs text-muted-foreground">
                    {t("noSearchResults")}
                  </p>
                )}
              </div>
            )}
          </div>
          <Select value={owner} onValueChange={(value) => setOwner(value ?? "all")}><SelectTrigger className="w-36" aria-label={t("allOwners")}><SelectValue>{owner === "all" ? t("allOwners") : <UserIdentity userId={owner} />}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">{t("allOwners")}</SelectItem>{schedule.members.map((member) => <SelectItem key={member.id} value={member.id}><UserIdentity userId={member.id} name={member.name} /></SelectItem>)}</SelectContent></Select>
          <Select value={health} onValueChange={(value) => setHealth((value ?? "all") as typeof health)}><SelectTrigger className="w-32" aria-label={t("allHealth")}><SelectValue>{health === "risk" ? t("atRisk") : health === "track" ? t("onTrack") : t("allHealth")}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">{t("allHealth")}</SelectItem><SelectItem value="track">{t("onTrack")}</SelectItem><SelectItem value="risk">{t("atRisk")}</SelectItem></SelectContent></Select>
          <div className="flex w-full flex-wrap items-center gap-2 border-t pt-3" role="group" aria-label={t("timelineControls")}><div className="flex rounded-md border p-0.5">
            {(["week", "month", "quarter"] as const).map((option) => <Button key={option} size="xs" variant={zoom === option ? "secondary" : "ghost"} onClick={() => setTimelineZoom(option)}>{t(option)}</Button>)}
          </div>
          <Button size="sm" variant="outline" className="hidden md:inline-flex" onClick={fitTimelineView}><Minimize2 className="size-4" />{t("fitView")}</Button>
          <Button size="sm" variant="outline" className="hidden md:inline-flex" onClick={scrollToToday}><LocateFixed className="size-4" />{t("today")}</Button>
          <Button size="sm" variant={criticalVisible ? "secondary" : "outline"} className="hidden md:inline-flex" onClick={() => setCriticalVisible((value) => !value)}><GitBranch className="size-4" />{t("criticalPath")}</Button><Button size="sm" variant="outline" disabled={structurePending} onClick={tidyDependencyLines}><WandSparkles className="size-4" />{t("tidyLines")}</Button><Button size="sm" variant={linesVisible ? "secondary" : "outline"} aria-pressed={linesVisible} onClick={() => setLinesVisible(value => !value)}>{t("dependencyLines")}</Button></div>
          <div className="flex h-7 w-full min-w-0 items-center gap-2">
            <Popover><PopoverTrigger render={<Button size="xs" variant="ghost"><CircleHelp className="size-3.5" />{t("timelineHelp")}</Button>} />
              <PopoverContent className="w-80 space-y-3 text-xs"><p>{t("structureHelp")}</p><p>{t("lineHelp")}</p><p>{t("zoomHelp")}</p><p>{t("panHelp")}</p></PopoverContent>
            </Popover>
            <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" role="status" aria-live="polite">
              {structureDrag ? structureDrop?.valid ? t("drop" + (structureDrop.placement === "inside" ? "Inside" : structureDrop.placement === "before" ? "Before" : "After"), { name: structureDrop.row.label }) : t("structureInvalid") : ""}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
