"use client";

import { UserAttribution } from "@/components/user-identity";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { usePendingDeleteIds } from "@/lib/use-pending-delete";
import { Archive, ArchiveRestore, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { setProjectStatus } from "@/modules/projects/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ProjectDialogs,
  type ProjectDialogState,
  type ProjectMember,
  type ProjectPredecessorOption,
  type ProjectRecord,
} from "@/modules/projects/components/project-dialog";

type Project = ProjectRecord & { openTasks: number };

export function ProjectsClient({
  projects,
  members = [],
  predecessorOptions = [],
  hideCreateButton = false,
}: {
  projects: Project[];
  members?: ProjectMember[];
  predecessorOptions?: ProjectPredecessorOption[];
  /** Hide the inline "new project" button when the host page already offers one. */
  hideCreateButton?: boolean;
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

  function onSaved(saved: ProjectRecord) {
    setItems((current) => {
      const existing = current.find((project) => project.id === saved.id);
      const next = { ...saved, openTasks: existing?.openTasks ?? 0 };
      return existing
        ? current.map((project) => (project.id === saved.id ? next : project))
        : [next, ...current];
    });
  }

  function setLocalStatus(id: string, status: Project["status"]) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, status } : item)),
    );
  }

  async function restore(project: Project) {
    const previous = items;
    setLocalStatus(project.id, "active");
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
  const visible = items.filter((p) => !pendingDeleteIds.has(p.id));
  const active = visible.filter((p) => p.status === "active");
  const archived = visible.filter((p) => p.status === "archived");

  return (
    <div className="flex flex-col gap-6">
      {!hideCreateButton && (
        <Button size="sm" className="self-start" onClick={() => setDialog({ kind: "create" })}>
          <Plus className="size-4" />
          {t("newProject")}
        </Button>
      )}

      {active.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("noProjects")}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {active.map((project) => (
          <Card key={project.id} className="relative min-w-0 transition-shadow hover:shadow-md">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <Link
                  href={`/projects/${project.id}`}
                  className="grid min-w-0 flex-1 gap-1"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="inline-block size-3 shrink-0 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                    <CardTitle className="truncate" title={project.name}>{project.name}</CardTitle>
                  </span>
                  <UserAttribution userId={project.managerId} relation="managedBy" />
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={t("projectActions", {
                          name: project.name,
                        })}
                      />
                    }
                  >
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setDialog({ kind: "edit", project })}>
                      <Pencil className="mr-2 size-4" />
                      {tCommon("edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDialog({ kind: "archive", project })}>
                      <Archive className="mr-2 size-4" />
                      {t("archive")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setDialog({ kind: "delete", project })}
                    >
                      <Trash2 className="mr-2 size-4" />
                      {t("deleteProject")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {project.description && (
                <CardDescription className="line-clamp-2">
                  {project.description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <Link
                href={`/projects/${project.id}`}
                className="text-sm text-muted-foreground"
              >
                {t("openTasks", { count: project.openTasks })}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      {archived.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {t("archivedHeading")}
          </h2>
          <div className="flex flex-col divide-y rounded-md border">
            {archived.map((project) => (
              <div key={project.id} className="flex items-center gap-3 px-3 py-2">
                <span
                  className="inline-block size-2.5 rounded-full opacity-50"
                  style={{ backgroundColor: project.color }}
                />
                <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                  {project.name}<br /><UserAttribution userId={project.managerId} relation="managedBy" />
                </span>
                <Badge variant="secondary" className="max-sm:hidden">{t("archived")}</Badge>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title={t("unarchive")}
                  aria-label={t("unarchive")}
                  onClick={() => restore(project)}
                >
                  <ArchiveRestore className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("deleteProject")}
                  onClick={() => setDialog({ kind: "delete", project })}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <ProjectDialogs
        state={dialog}
        onStateChange={setDialog}
        members={members}
        predecessorOptions={predecessorOptions}
        onSaved={onSaved}
        onArchived={(id) => setLocalStatus(id, "archived")}
        onDeleted={(id) => setItems((current) => current.filter((item) => item.id !== id))}
      />
    </div>
  );
}
