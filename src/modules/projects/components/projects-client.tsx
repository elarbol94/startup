"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { usePendingDeleteIds } from "@/lib/use-pending-delete";
import { useBulkAction } from "@/lib/use-bulk-action";
import { useRowSelection } from "@/lib/use-row-selection";
import { Plus, SquareKanban } from "lucide-react";
import { setProjectStatus } from "@/modules/projects/actions";
import { setProjectsStatus } from "@/modules/projects/project-bulk-actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import {
  ProjectDialogs,
  type ProjectDialogState,
  type ProjectMember,
  type ProjectPredecessorOption,
  type ProjectRecord,
} from "@/modules/projects/components/project-dialog";
import { ArchivedProjectRow } from "./projects-list/archived-project-row";
import { BulkDeleteProjectsDialog } from "./projects-list/bulk-delete-projects-dialog";
import { ProjectRow, projectTableCell, type ProjectHealth, type ProjectListItem } from "./projects-list/project-row";
import { ProjectsBulkBar } from "./projects-list/projects-bulk-bar";

export function ProjectsClient({
  projects,
  members = [],
  predecessorOptions = [],
  hideCreateButton = false,
  health,
}: {
  projects: ProjectListItem[];
  members?: ProjectMember[];
  predecessorOptions?: ProjectPredecessorOption[];
  /** Hide the inline "new project" button when the host page already offers one. */
  hideCreateButton?: boolean;
  /** Progress and schedule risk per active project (from the portfolio schedule). */
  health?: Map<string, ProjectHealth>;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const router = useRouter();
  // Local copy for instant feedback; replaced whenever the server sends new props.
  const [items, setItems] = useState(projects);
  const [prevProjects, setPrevProjects] = useState(projects);
  if (prevProjects !== projects) {
    setPrevProjects(projects);
    setItems(projects);
  }
  const [dialog, setDialog] = useState<ProjectDialogState>(null);
  const [bulkDeleteIds, setBulkDeleteIds] = useState<string[] | null>(null);

  function onSaved(saved: ProjectRecord) {
    setItems((current) => {
      const existing = current.find((project) => project.id === saved.id);
      const next = { ...saved, openTasks: existing?.openTasks ?? 0 };
      return existing
        ? current.map((project) => (project.id === saved.id ? next : project))
        : [next, ...current];
    });
  }

  function setLocalStatus(ids: readonly string[], status: ProjectListItem["status"]) {
    const changed = new Set(ids);
    setItems((current) => current.map((item) => (changed.has(item.id) ? { ...item, status } : item)));
  }

  async function restore(project: ProjectListItem) {
    const previous = items;
    setLocalStatus([project.id], "active");
    try {
      await setProjectStatus(project.id, "active");
      router.refresh();
    } catch {
      setItems(previous);
      toast.error(tCommon("error"));
    }
  }

  // Projects awaiting a delayed delete (Undo window) are hidden locally.
  const pendingDeleteIds = usePendingDeleteIds();
  const visible = useMemo(() => items.filter((p) => !pendingDeleteIds.has(p.id)), [items, pendingDeleteIds]);
  const active = visible.filter((p) => p.status === "active");
  const archived = visible.filter((p) => p.status === "archived");
  const visibleIds = useMemo(() => visible.map((project) => project.id), [visible]);
  const selection = useRowSelection(visibleIds);
  const { run, pending } = useBulkAction(selection.deselect);

  async function bulkStatus(ids: string[], status: ProjectListItem["status"]) {
    const previous = items;
    setLocalStatus(ids, status);
    const outcome = await run(() => setProjectsStatus({ ids, status }), { done: (result) => t(status === "archived" ? "bulk.archived" : "bulk.restored", { count: result.succeededIds.length }) });
    if (!outcome) setItems(previous);
  }

  return (
    <div className="flex flex-col gap-5">
      {!hideCreateButton && (
        <Button className="self-start" onClick={() => setDialog({ kind: "create" })}>
          <Plus className="size-4" />
          {t("newProject")}
        </Button>
      )}

      <section className="overflow-hidden rounded-xl border bg-card shadow-card">
        {active.length === 0 ? (
          <EmptyState
            icon={<SquareKanban />}
            title={t("noProjects")}
            actions={hideCreateButton ? undefined : (
              <Button size="sm" onClick={() => setDialog({ kind: "create" })}><Plus className="size-4" />{t("newProject")}</Button>
            )}
          />
        ) : (
          <div className="overflow-x-auto max-md:overflow-x-visible">
            <table className="w-full border-collapse text-[13.5px] max-md:block">
              <thead className="max-md:hidden">
                <tr className="border-b text-left text-[11.5px] font-medium text-muted-foreground">
                  <th scope="col" className={cn(projectTableCell, "h-9 pl-[18px] font-medium")}>{t("name")}</th>
                  <th scope="col" className={cn(projectTableCell, "h-9 font-medium")}>{t("progress")}</th>
                  <th scope="col" className={cn(projectTableCell, "h-9 font-medium")}>{t("manager")}</th>
                  <th scope="col" className={cn(projectTableCell, "h-9 font-medium")}>{t("targetEnd")}</th>
                  <th scope="col" className={cn(projectTableCell, "h-9 font-medium")}>{t("viewTasks")}</th>
                  <th scope="col" className={cn(projectTableCell, "h-9 font-medium")}>{tCommon("status")}</th>
                  <th scope="col" className={cn(projectTableCell, "h-9 font-medium")}><span className="sr-only">{tCommon("actions")}</span></th>
                </tr>
              </thead>
              <tbody className="max-md:block">
                {active.map((project) => <ProjectRow key={project.id} project={project} health={health?.get(project.id)} selection={selection} onDialog={setDialog} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {archived.length > 0 && (
        <section className="overflow-hidden rounded-xl border bg-card shadow-card">
          <div className="flex items-center gap-2 border-b border-line-soft px-[18px] py-3.5">
            <h2 className="text-[14.5px] font-semibold">{t("archivedHeading")}</h2>
            <span className="text-[13px] tabular-nums text-muted-foreground">{archived.length}</span>
          </div>
          <div className="flex flex-col divide-y divide-line-soft">
            {archived.map((project) => (
              <ArchivedProjectRow
                key={project.id}
                project={project}
                selection={selection}
                onRestore={() => void restore(project)}
                onDelete={() => setDialog({ kind: "delete", project })}
              />
            ))}
          </div>
        </section>
      )}

      <ProjectsBulkBar
        selection={selection}
        projects={visible}
        pending={pending}
        onStatus={(ids, status) => void bulkStatus(ids, status)}
        onDelete={setBulkDeleteIds}
      />
      <BulkDeleteProjectsDialog
        ids={bulkDeleteIds}
        onOpenChange={(open) => { if (!open) setBulkDeleteIds(null); }}
        onScheduled={(ids) => selection.deselect(ids)}
      />
      <ProjectDialogs
        state={dialog}
        onStateChange={setDialog}
        members={members}
        predecessorOptions={predecessorOptions}
        onSaved={onSaved}
        onArchived={(id) => setLocalStatus([id], "archived")}
        onDeleted={(id) => setItems((current) => current.filter((item) => item.id !== id))}
      />
    </div>
  );
}
