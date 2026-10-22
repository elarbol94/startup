"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  Pencil,
  Settings,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setProjectStatus } from "@/modules/projects/actions";
import { ProjectConfirmDialog } from "./project-dialog/project-confirm-dialog";
import type { ProjectMember, ProjectPredecessorOption, ProjectRecord } from "./project-dialog/project-dialog-types";
import { ProjectForm } from "./project-dialog/project-form";

export type { ProjectMember, ProjectPredecessorOption, ProjectRecord } from "./project-dialog/project-dialog-types";
export { projectPredecessorOptions } from "./project-dialog/project-dialog-utils";
export { ProjectConfirmDialog } from "./project-dialog/project-confirm-dialog";

/** Shared create/edit dialog for projects. The form is reset every time it opens. */
export function ProjectDialog({
  open,
  onOpenChange,
  project,
  members,
  predecessorOptions = [],
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: ProjectRecord | null;
  members: ProjectMember[];
  predecessorOptions?: ProjectPredecessorOption[];
  onSaved?: (project: ProjectRecord) => void;
}) {
  const t = useTranslations("projects");
  // Remount the form on every opening so no field leaks into the next project.
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((value) => value + 1);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{project ? t("editProject") : t("newProject")}</DialogTitle>
        </DialogHeader>
        <ProjectForm
          key={`${project?.id ?? "new"}:${session}`}
          project={project ?? null}
          members={members}
          predecessorOptions={predecessorOptions}
          onSaved={(saved) => {
            onSaved?.(saved);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export type ProjectDialogState =
  | { kind: "create" }
  | { kind: "edit" | "archive" | "delete"; project: ProjectRecord }
  | null;

/** Create/edit/archive/delete dialogs driven by one piece of state. */
export function ProjectDialogs({
  state,
  onStateChange,
  members,
  predecessorOptions,
  onSaved,
  onArchived,
  onDeleted,
  afterDeleteHref,
}: {
  state: ProjectDialogState;
  onStateChange: (state: ProjectDialogState) => void;
  members: ProjectMember[];
  predecessorOptions?: ProjectPredecessorOption[];
  onSaved?: (project: ProjectRecord) => void;
  onArchived?: (projectId: string) => void;
  onDeleted?: (projectId: string) => void;
  afterDeleteHref?: string;
}) {
  const formOpen = state?.kind === "create" || state?.kind === "edit";
  const [formProject, setFormProject] = useState<ProjectRecord | null>(null);
  if (formOpen) {
    const next = state.kind === "edit" ? state.project : null;
    if (next !== formProject) setFormProject(next);
  }
  const close = (open: boolean) => {
    if (!open) onStateChange(null);
  };
  return (
    <>
      <ProjectDialog
        open={formOpen}
        onOpenChange={close}
        project={formProject}
        members={members}
        predecessorOptions={predecessorOptions}
        onSaved={onSaved}
      />
      <ProjectConfirmDialog
        action="archive"
        project={state?.kind === "archive" ? state.project : null}
        onOpenChange={close}
        onDone={onArchived}
      />
      <ProjectConfirmDialog
        action="delete"
        project={state?.kind === "delete" ? state.project : null}
        onOpenChange={close}
        onDone={onDeleted}
        afterDoneHref={afterDeleteHref}
      />
    </>
  );
}

/** Edit/archive/delete menu for the project page header. */
export function ProjectSettingsButton({
  project,
  members,
  predecessorOptions,
}: {
  project: ProjectRecord;
  members: ProjectMember[];
  predecessorOptions?: ProjectPredecessorOption[];
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [state, setState] = useState<ProjectDialogState>(null);

  async function restore() {
    try {
      await setProjectStatus(project.id, "active");
      router.refresh();
    } catch {
      toast.error(tCommon("error"));
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              aria-label={t("projectSettings")}
              title={t("projectSettings")}
            />
          }
        >
          <Settings className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setState({ kind: "edit", project })}>
            <Pencil className="mr-2 size-4" />
            {t("editProject")}
          </DropdownMenuItem>
          {project.status === "archived" ? (
            <DropdownMenuItem onClick={restore}>
              <ArchiveRestore className="mr-2 size-4" />
              {t("unarchive")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => setState({ kind: "archive", project })}>
              <Archive className="mr-2 size-4" />
              {t("archive")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onClick={() => setState({ kind: "delete", project })}>
            <Trash2 className="mr-2 size-4" />
            {t("deleteProject")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ProjectDialogs
        state={state}
        onStateChange={setState}
        members={members}
        predecessorOptions={predecessorOptions}
        afterDeleteHref="/projects"
      />
    </>
  );
}
