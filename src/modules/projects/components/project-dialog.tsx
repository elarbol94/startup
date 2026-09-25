"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePendingDelete } from "@/lib/use-pending-delete";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Pencil,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import { UserIdentity } from "@/components/user-identity";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteProject,
  setProjectStatus,
  upsertProject,
  type ProjectInput,
} from "@/modules/projects/actions";
import {
  addProjectPredecessor,
  getProjectImpact,
  getProjectLinks,
  removeProjectDependency,
} from "@/modules/projects/project-actions";
import type { ProjectImpact, ProjectLinkSummary } from "@/modules/projects/project-links";
import type { projects as projectsTable } from "@/modules/projects/schema";
import { addCalendarDays } from "@/modules/projects/schedule";

export type ProjectRecord = typeof projectsTable.$inferSelect;
export type ProjectMember = { id: string; name: string };
export type ProjectPredecessorOption = {
  id: string;
  title: string;
  dueDate: string | null;
  type: "project" | "task";
  /** Owning project of a task option; used to hide the project's own tasks. */
  projectId?: string | null;
};

/** Predecessor choices (active projects and tasks) from the portfolio schedule. */
export function projectPredecessorOptions(schedule: {
  projects: Array<{ id: string; name: string; targetEndDate: string | null }>;
  tasks: Array<{ id: string; title: string; dueDate: string | null; projectId: string }>;
}): ProjectPredecessorOption[] {
  return [
    ...schedule.projects.map((project) => ({ id: project.id, title: project.name, dueDate: project.targetEndDate, type: "project" as const })),
    ...schedule.tasks.map((task) => ({ id: task.id, title: task.title, dueDate: task.dueDate, type: "task" as const, projectId: task.projectId })),
  ];
}

const optionKey = (option: { type: string; id: string }) => `${option.type}:${option.id}`;

function PredecessorSelect({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: ProjectPredecessorOption[];
}) {
  const t = useTranslations("projects");
  const label = (option: ProjectPredecessorOption) =>
    `${option.type === "project" ? t("projectLinkKindProject") : t("projectLinkKindTask")}: ${option.title}`;
  const selected = options.find((option) => optionKey(option) === value);
  return (
    <Select value={value} onValueChange={(next) => onChange(next ?? "none")}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue>{selected ? label(selected) : t("choosePredecessor")}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">{t("choosePredecessor")}</SelectItem>
        {options.map((option) => (
          <SelectItem key={optionKey(option)} value={optionKey(option)}>
            {label(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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

function ProjectForm({
  project,
  members,
  predecessorOptions,
  onSaved,
}: {
  project: ProjectRecord | null;
  members: ProjectMember[];
  predecessorOptions: ProjectPredecessorOption[];
  onSaved: (project: ProjectRecord) => void;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [color, setColor] = useState(project?.color ?? "#2563eb");
  const [managerId, setManagerId] = useState(project?.managerId ?? "none");
  const [plannedStartDate, setPlannedStartDate] = useState(project?.plannedStartDate ?? "");
  const [targetEndDate, setTargetEndDate] = useState(project?.targetEndDate ?? "");
  const [predecessor, setPredecessor] = useState("none");
  const [pending, setPending] = useState(false);

  const selectableOptions = predecessorOptions.filter(
    (option) =>
      option.dueDate &&
      !(project && (option.type === "project" ? option.id === project.id : option.projectId === project.id)),
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const selected = !project && predecessor !== "none"
        ? selectableOptions.find((option) => optionKey(option) === predecessor)
        : undefined;
      const input: ProjectInput = {
        id: project?.id,
        name,
        description,
        color,
        managerId: managerId === "none" ? null : managerId,
        plannedStartDate: plannedStartDate || null,
        targetEndDate: targetEndDate || null,
        predecessor: selected ? { type: selected.type, id: selected.id } : null,
      };
      const saved = await upsertProject(input, [
        t("colOpen"),
        t("colInProgress"),
        t("colDone"),
      ]);
      toast.success(tCommon("saved"));
      onSaved(saved);
      router.refresh();
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="project-name">{t("name")}</Label>
        <Input
          id="project-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          maxLength={200}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="project-description">{t("description")}</Label>
        <Textarea
          id="project-description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={2000}
        />
      </div>
      <div className="grid grid-cols-[5rem_1fr] gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-color">{t("color")}</Label>
          <ColorPicker
            aria-label={t("color")}
            id="project-color"
            value={color}
            onChange={setColor}
            className="h-9 w-full cursor-pointer rounded-md border bg-background p-1"
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="project-manager">{t("manager")}</Label>
          <Select value={managerId} onValueChange={(value) => setManagerId(value ?? "none")}>
            <SelectTrigger id="project-manager" className="w-full">
              <SelectValue>
                {managerId === "none" ? t("unassigned") : <UserIdentity userId={managerId} />}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("unassigned")}</SelectItem>
              {members.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  <UserIdentity userId={member.id} name={member.name} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-planned-start">{t("plannedStart")}</Label>
          <Input
            id="project-planned-start"
            type="date"
            value={plannedStartDate}
            onChange={(event) => setPlannedStartDate(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-target-end">{t("targetEnd")}</Label>
          <Input
            id="project-target-end"
            type="date"
            min={plannedStartDate || undefined}
            value={targetEndDate}
            onChange={(event) => setTargetEndDate(event.target.value)}
          />
        </div>
      </div>
      {project ? (
        <ProjectLinksEditor
          project={project}
          options={selectableOptions}
          onProjectChanged={(changed) => {
            // A new predecessor may have moved this project; keep the form in sync
            // so saving doesn't move it back.
            setPlannedStartDate(changed.plannedStartDate ?? "");
            setTargetEndDate(changed.targetEndDate ?? "");
          }}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="project-predecessor">{t("projectPredecessors")}</Label>
          <PredecessorSelect
            id="project-predecessor"
            value={predecessor}
            options={selectableOptions}
            onChange={(next) => {
              setPredecessor(next);
              const selected = selectableOptions.find((option) => optionKey(option) === next);
              if (selected?.dueDate) setPlannedStartDate(addCalendarDays(selected.dueDate, 1));
            }}
          />
          <p className="text-xs text-muted-foreground">{t("projectPredecessorNote")}</p>
        </div>
      )}
      <Button type="submit" disabled={pending}>
        {tCommon("save")}
      </Button>
    </form>
  );
}

const linkErrorKey = {
  notFound: "projectLinkNotFound",
  self: "projectLinkSelf",
  exists: "projectLinkExists",
  cycle: "projectLinkCycle",
} as const;

function ProjectLinksEditor({
  project,
  options,
  onProjectChanged,
}: {
  project: ProjectRecord;
  options: ProjectPredecessorOption[];
  onProjectChanged: (project: ProjectRecord) => void;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [links, setLinks] = useState<ProjectLinkSummary | null>(null);
  const [choice, setChoice] = useState("none");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProjectLinks(project.id)
      .then((result) => {
        if (!cancelled) setLinks(result);
      })
      .catch(() => {
        if (!cancelled) toast.error(tCommon("error"));
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, tCommon]);

  const linked = new Set(links?.predecessors.map((link) => `${link.type}:${link.targetId}`));
  const available = options.filter((option) => !linked.has(optionKey(option)));

  async function add() {
    const selected = available.find((option) => optionKey(option) === choice);
    if (!selected) return;
    setPending(true);
    try {
      const result = await addProjectPredecessor({
        projectId: project.id,
        predecessor: { type: selected.type, id: selected.id },
      });
      if (!result.ok) {
        toast.error(t(linkErrorKey[result.code]));
        return;
      }
      setLinks(result.links);
      setChoice("none");
      onProjectChanged(result.project);
      router.refresh();
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setPending(true);
    try {
      await removeProjectDependency({ id });
      setLinks((current) =>
        current && {
          predecessors: current.predecessors.filter((link) => link.id !== id),
          successors: current.successors.filter((link) => link.id !== id),
        },
      );
      router.refresh();
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setPending(false);
    }
  }

  const linkRow = (id: string, title: string, meta: string | null) => (
    <li key={id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
      <span className="min-w-0 flex-1 truncate" title={title}>
        {title}
        {meta && <span className="ml-1 text-xs text-muted-foreground">· {meta}</span>}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={pending}
        aria-label={t("removeProjectLink", { name: title })}
        title={t("removeProjectLink", { name: title })}
        onClick={() => remove(id)}
      >
        <X className="size-3.5" />
      </Button>
    </li>
  );

  return (
    <section className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3" aria-label={t("dependencies")}>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("projectPredecessors")}</span>
        <p className="text-xs text-muted-foreground">{t("projectPredecessorNote")}</p>
        {links && links.predecessors.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("noProjectPredecessors")}</p>
        )}
        {links && links.predecessors.length > 0 && (
          <ul className="flex flex-col gap-1">
            {links.predecessors.map((link) =>
              linkRow(
                link.id,
                link.title,
                link.type === "project"
                  ? t("projectLinkKindProject")
                  : [t("projectLinkKindTask"), link.projectName].filter(Boolean).join(" · "),
              ),
            )}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <PredecessorSelect
              id="project-add-predecessor"
              value={choice}
              options={available}
              onChange={setChoice}
            />
          </div>
          <Button type="button" variant="outline" size="sm" disabled={pending || choice === "none"} onClick={add}>
            {t("addPredecessor")}
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("projectSuccessors")}</span>
        {links && links.successors.length === 0 && (
          <p className="text-xs text-muted-foreground">{t("noProjectSuccessors")}</p>
        )}
        {links && links.successors.length > 0 && (
          <ul className="flex flex-col gap-1">
            {links.successors.map((link) => linkRow(link.id, link.title, t("projectLinkKindProject")))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Confirmation for archiving or deleting a project, with what it affects. */
export function ProjectConfirmDialog({
  action,
  project,
  onOpenChange,
  onDone,
  afterDoneHref,
}: {
  action: "archive" | "delete";
  project: Pick<ProjectRecord, "id" | "name"> | null;
  onOpenChange: (open: boolean) => void;
  onDone?: (projectId: string) => void;
  /** Navigate here afterwards instead of refreshing the current route. */
  afterDoneHref?: string;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [impact, setImpact] = useState<{ projectId: string; value: ProjectImpact | null } | null>(null);
  const [pending, setPending] = useState(false);
  const scheduleDelete = usePendingDelete();
  // Keep the last project visible while the dialog animates closed.
  const [shown, setShown] = useState(project);
  if (project && project !== shown) setShown(project);

  const projectId = project?.id;
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    getProjectImpact(projectId)
      .then((value) => {
        if (!cancelled) setImpact({ projectId, value });
      })
      .catch(() => {
        // Still allow the action; only the counts are missing.
        if (!cancelled) setImpact({ projectId, value: null });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const loaded = Boolean(impact && impact.projectId === projectId);
  const current = loaded ? impact!.value : null;

  async function confirm() {
    if (!project) return;
    if (action === "delete") {
      // Delayed delete: hidden now, committed after the Undo window. The
      // project and its tasks are filtered out wherever they are listed.
      const projectId = project.id;
      scheduleDelete({
        hiddenIds: [projectId],
        commit: async () => {
          await deleteProject(projectId);
        },
        onCommitted: () => {
          onDone?.(projectId);
          router.refresh();
        },
      });
      onOpenChange(false);
      if (afterDoneHref) router.push(afterDoneHref);
      return;
    }
    setPending(true);
    try {
      await setProjectStatus(project.id, "archived");
      onDone?.(project.id);
      onOpenChange(false);
      if (afterDoneHref) router.push(afterDoneHref);
      else router.refresh();
    } catch {
      toast.error(tCommon("error"));
    } finally {
      setPending(false);
    }
  }

  const name = shown?.name ?? "";
  return (
    <Dialog open={Boolean(project)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{action === "delete" ? t("deleteProjectTitle") : t("archiveProjectTitle")}</DialogTitle>
          <DialogDescription>
            {action === "delete" ? t("deleteProjectConfirm", { name }) : t("archiveProjectConfirm", { name })}
          </DialogDescription>
        </DialogHeader>
        {action === "delete" && current && (
          <p className="text-sm">
            {t("deleteProjectImpact", {
              tasks: current.tasks,
              columns: current.columns,
              dependencies: current.dependencies,
            })}
          </p>
        )}
        {action === "archive" && current && current.openTasks > 0 && (
          <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t("archiveProjectOpenTasks", { count: current.openTasks })}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button
            variant={action === "delete" ? "destructive" : "default"}
            disabled={pending || (action === "delete" && !loaded)}
            onClick={confirm}
          >
            {action === "delete" ? tCommon("delete") : t("archive")}
          </Button>
        </DialogFooter>
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
              size="icon-sm"
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
