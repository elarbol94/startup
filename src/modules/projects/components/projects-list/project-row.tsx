"use client";

// One active project as a row of the Projektübersicht table (design 1b): name, progress,
// manager, target date, open tasks, schedule status and actions. Phones stack the cells.
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Archive, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { UserIdentity } from "@/components/user-identity";
import { RowSelectCheckbox } from "@/components/row-selection";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { RowSelection } from "@/lib/use-row-selection";
import { localDateValue } from "@/modules/tasks/deadline-utils";
import type { ProjectDialogState, ProjectRecord } from "../project-dialog";

export type ProjectListItem = ProjectRecord & { openTasks: number };
export type ProjectHealth = { progress: number; atRisk: boolean };

/** Shared cell classes: 42 px rows with hairlines on desktop, stacked cells on phones. */
export const projectTableCell = "h-[42px] px-3 align-middle whitespace-nowrap max-md:block max-md:h-auto max-md:p-0 max-md:text-[13px] max-md:empty:hidden";

export function ProjectRow({ project, health, selection, onDialog }: { project: ProjectListItem; health?: ProjectHealth; selection: RowSelection; onDialog: (state: ProjectDialogState) => void }) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const selected = selection.isSelected(project.id);
  const target = project.targetEndDate ? localDateValue(project.targetEndDate) : null;
  return (
    <tr
      data-selected={selected || undefined}
      data-testid="project-card"
      className="group border-b border-line-soft transition-colors last:border-b-0 hover:bg-accent data-selected:bg-brand-soft max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-1.5 max-md:px-4 max-md:py-3"
    >
      <td className={cn(projectTableCell, "pl-[18px] max-md:basis-full max-md:text-sm")}>
        <span className="flex min-w-0 items-center gap-2.5">
          <span className={cn("flex transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100", selection.count > 0 && "sm:opacity-100")}>
            <RowSelectCheckbox id={project.id} label={project.name} selection={selection} />
          </span>
          <span className="size-2 shrink-0 rounded-[3px]" style={{ backgroundColor: project.color }} aria-hidden />
          <span className="grid min-w-0">
            <Link href={`/projects/${project.id}`} className="truncate font-medium hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring" title={project.name}>
              {project.name}
            </Link>
            {project.description && <span className="max-w-[28rem] truncate text-xs text-muted-foreground" title={project.description}>{project.description}</span>}
          </span>
        </span>
      </td>
      <td className={projectTableCell}>
        {health && (
          <span className="flex items-center gap-2" aria-label={`${t("progress")}: ${health.progress}%`}>
            <span className="h-1.5 w-[120px] overflow-hidden rounded-full bg-muted max-md:w-20" aria-hidden>
              <span className="block h-full rounded-full bg-brand" style={{ width: `${health.progress}%` }} />
            </span>
            <span className="text-xs tabular-nums text-muted-foreground" aria-hidden>{health.progress} %</span>
          </span>
        )}
      </td>
      <td className={projectTableCell}>
        {project.managerId ? <UserIdentity userId={project.managerId} compact /> : <span className="text-muted-foreground">{t("noManager")}</span>}
      </td>
      <td className={cn(projectTableCell, "tabular-nums text-muted-foreground")}>
        {target ? format.dateTime(target, { day: "2-digit", month: "2-digit", year: "numeric" }) : null}
      </td>
      <td className={cn(projectTableCell, "text-muted-foreground")}>
        <Link href={`/projects/${project.id}`} className="hover:text-foreground hover:underline">{t("openTasks", { count: project.openTasks })}</Link>
      </td>
      <td className={projectTableCell}>
        {health && (
          <span
            className={cn(
              "inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold whitespace-nowrap",
              health.atRisk ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-brand-soft text-brand-ink",
            )}
          >
            {health.atRisk ? t("atRisk") : t("onTrack")}
          </span>
        )}
      </td>
      <td className={cn(projectTableCell, "w-px pr-3 text-right max-md:ml-auto")}>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t("projectActions", { name: project.name })} />}>
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onDialog({ kind: "edit", project })}><Pencil className="mr-2 size-4" />{tCommon("edit")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDialog({ kind: "archive", project })}><Archive className="mr-2 size-4" />{t("archive")}</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => onDialog({ kind: "delete", project })}><Trash2 className="mr-2 size-4" />{t("deleteProject")}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}
