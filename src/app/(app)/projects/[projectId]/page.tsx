import { UserAttribution } from "@/components/user-identity";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, BookOpen, KanbanSquare } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getBoard, getPortfolioSchedule, getProject, listMembers } from "@/modules/projects/queries";
import { BoardClient } from "@/modules/projects/components/board-client";
import { ProjectSettingsButton } from "@/modules/projects/components/project-dialog";
import { EvidencePanel } from "@/modules/wiki/components/evidence-panel";
import { ContextPanel } from "@/modules/context/components/context-panel";
import { listEntityContext } from "@/modules/context/queries";
import { cn } from "@/lib/utils";

export default async function ProjectBoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  await requireUser();
  const [{ projectId }, query, t] = await Promise.all([
    params,
    searchParams,
    getTranslations("projects"),
  ]);
  const project = getProject(projectId);
  if (!project) notFound();
  const knowledgeView = query.view === "knowledge";
  const projectContext = knowledgeView
    ? listEntityContext("project", projectId)
    : undefined;

  const { columns, tasksByColumn, subtasksByParent } = getBoard(projectId);
  const members = listMembers();
  const schedule = getPortfolioSchedule();
  const predecessorOptions = [
    ...schedule.projects.map((project) => ({ id: project.id, title: project.name, dueDate: project.targetEndDate, type: "project" as const })),
    ...schedule.tasks.map((task) => ({ id: task.id, title: task.title, dueDate: task.dueDate, type: "task" as const })),
  ];

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
        </div>
        <nav
          aria-label={t("projectView")}
          className="ml-auto flex rounded-lg border bg-muted/40 p-1"
        >
          <Link
            href={`/projects/${projectId}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              !knowledgeView
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <KanbanSquare className="size-4" />
            {t("viewTasks")}
          </Link>
          <Link
            href={`/projects/${projectId}?view=knowledge`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              knowledgeView
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <BookOpen className="size-4" />
            {t("viewKnowledge")}
          </Link>
        </nav>
        <ProjectSettingsButton project={project} members={members} predecessorOptions={predecessorOptions} />
      </header>

      {knowledgeView ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.55fr)]">
          <ContextPanel
            subjectType="project"
            subjectId={projectId}
            subjectLabel={project.name}
            subjectHref={`/projects/${projectId}?view=knowledge`}
            accentColor={project.color}
            initialContext={projectContext}
          />
          <EvidencePanel targetType="project" targetId={projectId} />
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
