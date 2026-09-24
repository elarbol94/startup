// Portfolio page chrome above the Gantt: the title header with portfolio stats and the
// timeline toolbar (view switch, search, filters, zoom and line controls). Used by portfolio-client.tsx.
"use client";

import { UserIdentity } from "@/components/user-identity";

import { useFormatter, useTranslations } from "next-intl";
import {
  CalendarClock,
  CircleHelp,
  Ellipsis,
  FolderKanban,
  Focus,
  GitBranch,
  LocateFixed,
  Minimize2,
  Plus,
  Search,
  Spline,
  WandSparkles,
} from "lucide-react";
import type {
  PortfolioSchedule,
  PortfolioTask,
} from "@/modules/projects/queries";
import { PageHeader } from "@/components/page-header";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    <PageHeader
      className="mb-0"
      title={t("title")}
      description={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{t("activeProjectCount", { count: schedule.projects.length })}</span>
          <span aria-hidden>·</span>
          <span className={cn(riskCount > 0 && "text-amber-700 dark:text-amber-400")}>{t("riskProjectCount", { count: riskCount })}</span>
          {nextMilestone?.dueDate && (
            <>
              <span aria-hidden>·</span>
              <span>{t("nextMilestone")}: {format.dateTime(parseDate(nextMilestone.dueDate), { day: "2-digit", month: "short" })}</span>
            </>
          )}
        </span>
      }
      actions={<Button onClick={() => setProjectDialog({ kind: "create" })}><Plus className="size-4" />{t("newProject")}</Button>}
    />
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
      {!embedded && <div className={cn("flex w-full gap-1", view === "timeline" && "border-b pb-3")}>
        <Button size="sm" variant={view === "timeline" ? "secondary" : "ghost"} onClick={() => setView("timeline")}><CalendarClock className="size-4" />{t("timeline")}</Button>
        <Button size="sm" variant={view === "projects" ? "secondary" : "ghost"} onClick={() => setView("projects")}><FolderKanban className="size-4" />{t("projectOverview")}</Button>
      </div>}
      {view === "timeline" && (
        <>
          <div className="relative w-full sm:w-64 lg:w-72">
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
          <div className="flex w-full gap-2 sm:w-auto"><Select value={owner} onValueChange={(value) => setOwner(value ?? "all")}><SelectTrigger className="min-w-0 flex-1 sm:w-44 sm:flex-none" aria-label={t("allOwners")}><SelectValue>{owner === "all" ? t("allOwners") : <UserIdentity userId={owner} />}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">{t("allOwners")}</SelectItem>{schedule.members.map((member) => <SelectItem key={member.id} value={member.id}><UserIdentity userId={member.id} name={member.name} /></SelectItem>)}</SelectContent></Select>
          <Select value={health} onValueChange={(value) => setHealth((value ?? "all") as typeof health)}><SelectTrigger className="min-w-0 flex-1 sm:w-40 sm:flex-none" aria-label={t("allHealth")}><SelectValue>{health === "risk" ? t("atRisk") : health === "track" ? t("onTrack") : t("allHealth")}</SelectValue></SelectTrigger><SelectContent><SelectItem value="all">{t("allHealth")}</SelectItem><SelectItem value="track">{t("onTrack")}</SelectItem><SelectItem value="risk">{t("atRisk")}</SelectItem></SelectContent></Select></div>
          <div className={cn("flex items-center gap-2 lg:ml-auto", !embedded && "max-md:hidden")} role="group" aria-label={t("timelineControls")}>
            <div className="flex rounded-md border p-0.5">
              {(["week", "month", "quarter"] as const).map((option) => <Button key={option} size="xs" variant={zoom === option ? "secondary" : "ghost"} aria-pressed={zoom === option} onClick={() => setTimelineZoom(option)}>{t(option)}</Button>)}
            </div>
            <Button size="sm" variant="outline" onClick={scrollToToday}><LocateFixed className="size-4" />{t("today")}</Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button size="sm" variant="outline" aria-label={t("viewOptions")}><Ellipsis className="size-4" /><span className="hidden sm:inline">{t("viewOptionsShort")}</span>{(criticalVisible || !linesVisible) && <span className="size-1.5 rounded-full bg-indigo-500" aria-hidden />}</Button>} />
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={fitTimelineView}><Minimize2 className="size-4" />{t("fitView")}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem checked={criticalVisible} onCheckedChange={(checked) => setCriticalVisible(Boolean(checked))}><GitBranch className="size-4" />{t("criticalPath")}</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={linesVisible} onCheckedChange={(checked) => setLinesVisible(Boolean(checked))}><Spline className="size-4" />{t("dependencyLines")}</DropdownMenuCheckboxItem>
                <DropdownMenuItem disabled={structurePending} onClick={tidyDependencyLines}><WandSparkles className="size-4" />{t("tidyLines")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Popover><PopoverTrigger render={<Button size="icon-sm" variant="ghost" aria-label={t("timelineHelp")} title={t("timelineHelp")}><CircleHelp className="size-4" /></Button>} />
              <PopoverContent align="end" className="w-80 space-y-3 text-xs"><p>{t("structureHelp")}</p><p>{t("lineHelp")}</p><p>{t("zoomHelp")}</p><p>{t("panHelp")}</p></PopoverContent>
            </Popover>
          </div>
          {/* Screen-reader status stays visually hidden unless a structure drag is in progress; a visible wide line caused horizontal scroll on laptops. */}
          <p className={structureDrag ? "w-full min-w-0 truncate text-xs text-muted-foreground" : "sr-only"} role="status" aria-live="polite">
            {structureDrag ? structureDrop?.valid ? t("drop" + (structureDrop.placement === "inside" ? "Inside" : structureDrop.placement === "before" ? "Before" : "After"), { name: structureDrop.row.label }) : t("structureInvalid") : ""}
          </p>
        </>
      )}
    </div>
  );
}
