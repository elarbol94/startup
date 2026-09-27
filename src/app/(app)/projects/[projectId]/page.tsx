import { UserAttribution } from "@/components/user-identity";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { NetworkContactsPanel } from "@/modules/network/components/network-contacts-panel";
import { listLinkedNetworkContacts } from "@/modules/network/link-queries";
import { listNetworkContactOptions } from "@/modules/network/queries";
import { listProjectConnections } from "@/modules/context/project-links";
import { ProjectConnectionsPanel } from "@/modules/projects/components/project-connections-panel";
import { ProjectPulseChips } from "@/modules/projects/components/project-pulse";
import { ProjectQuickCreate } from "@/modules/projects/components/project-quick-create";
import { ProjectViewTabs } from "@/modules/projects/components/project-view-tabs";
import { getProjectPulse } from "@/modules/projects/pulse";
import { ACTIVITY_MAX, ACTIVITY_PAGE_SIZE, listProjectActivity } from "@/modules/projects/activity";
import { getDependencyBadges } from "@/modules/projects/dependency-badges";
import { ProjectActivityFeed } from "@/modules/projects/components/project-activity-feed";
import { ProjectDependencyBadges } from "@/modules/projects/components/project-dependency-badges";
import { todayInVienna } from "@/modules/time/queries";
import { getBoard, getPortfolioSchedule, getProject, listMembers } from "@/modules/projects/queries";
import { BoardClient } from "@/modules/projects/components/board-client";
import { ProjectSettingsButton } from "@/modules/projects/components/project-dialog";
import { EvidencePanel } from "@/modules/wiki/components/evidence-panel";
import { ContextPanel } from "@/modules/context/components/context-panel";
import { listEntityContext } from "@/modules/context/queries";

export default async function ProjectBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ view?: string; limit?: string }>;
}) {
  const viewer = await requireUser();
  const [{ projectId }, query, t] = await Promise.all([
    params,
    searchParams,
    getTranslations("projects"),
  ]);
  const project = getProject(projectId);
  if (!project) notFound();
  const view = query.view === "knowledge" || query.view === "activity" ? query.view : "tasks";
  const knowledgeView = view === "knowledge";
  const projectContext = knowledgeView
    ? listEntityContext("project", projectId)
    : undefined;
  const today = todayInVienna();
  const pulse = getProjectPulse(projectId, today, viewer);
  const connections = knowledgeView
    ? listProjectConnections(projectId, viewer.id, today)
    : undefined;
  const dependencyBadges = getDependencyBadges(projectId, today);
  const activityLimit = Math.min(ACTIVITY_MAX, Math.max(ACTIVITY_PAGE_SIZE, Number(query.limit) || ACTIVITY_PAGE_SIZE));
  const activity = view === "activity"
    ? listProjectActivity(projectId, viewer, activityLimit)
    : undefined;

  const { columns, tasksByColumn, subtasksByParent } = getBoard(projectId);
  const members = listMembers();
  const schedule = getPortfolioSchedule();
  const predecessorOptions = [
    ...schedule.projects.map((project) => ({ id: project.id, title: project.name, dueDate: project.targetEndDate, type: "project" as const })),
    ...schedule.tasks.map((task) => ({ id: task.id, title: task.title, dueDate: task.dueDate, type: "task" as const })),
  ];
  // A project cannot follow itself or one of its own tasks.
  const ownTaskIds = new Set(schedule.tasks.filter((task) => task.projectId === projectId).map((task) => task.id));
  const projectPredecessorOptions = predecessorOptions.filter((option) =>
    option.type === "project" ? option.id !== projectId : !ownTaskIds.has(option.id),
  );

  return (
    <div className="grid min-w-0 gap-5">
      <header className="flex flex-wrap items-center gap-3 border-b pb-4">
        <Link
          href="/projects"
          aria-label={t("backToProjects")}
          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <span
          className="size-3 rounded-full"
          style={{ backgroundColor: project.color }}
        />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {project.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
            <UserAttribution userId={project.managerId} relation="managedBy" />
            <UserAttribution userId={project.createdBy} relation="createdBy" />
          </div>
          {project.description && (
            <p className="mt-0.5 max-w-2xl truncate text-xs text-muted-foreground">
              {project.description}
            </p>
          )}
          <div className="mt-2 grid gap-1.5">
            <ProjectPulseChips projectId={projectId} pulse={pulse} />
            <ProjectDependencyBadges badges={dependencyBadges} />
          </div>
        </div>
        <ProjectViewTabs projectId={projectId} view={view} />
        <ProjectQuickCreate projectId={projectId} projectName={project.name} />
        <ProjectSettingsButton project={project} members={members} predecessorOptions={projectPredecessorOptions} />
      </header>

      {activity ? (
        <ProjectActivityFeed
          items={activity.items}
          hasMore={activity.hasMore}
          moreHref={`/projects/${projectId}?view=activity&limit=${activityLimit + ACTIVITY_PAGE_SIZE}`}
          today={today}
        />
      ) : knowledgeView ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.55fr)]">
          <ContextPanel
            subjectType="project"
            subjectId={projectId}
            subjectLabel={project.name}
            subjectHref={`/projects/${projectId}?view=knowledge`}
            accentColor={project.color}
            initialContext={projectContext}
          />
          <div className="grid gap-5">
            <ProjectConnectionsPanel connections={connections!} today={today} />
            <NetworkContactsPanel
              targetType="project"
              targetId={projectId}
              contacts={listLinkedNetworkContacts(viewer, "project", projectId)}
              options={listNetworkContactOptions(viewer)}
            />
            <EvidencePanel targetType="project" targetId={projectId} />
          </div>
        </div>
      ) : (
        <BoardClient
          project={project}
          columns={columns}
          tasksByColumn={tasksByColumn}
          subtasksByParent={subtasksByParent}
          members={members}
          predecessorOptions={predecessorOptions}
          hideHeader
        />
      )}
    </div>
  );
}
