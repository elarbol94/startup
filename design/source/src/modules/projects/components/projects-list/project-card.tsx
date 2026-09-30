"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Archive, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { UserAttribution } from "@/components/user-identity";
import { RowSelectCheckbox } from "@/components/row-selection";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { RowSelection } from "@/lib/use-row-selection";
import type { ProjectDialogState, ProjectRecord } from "../project-dialog";

export type ProjectListItem = ProjectRecord & { openTasks: number };

export function ProjectCard({ project, selection, onDialog }: { project: ProjectListItem; selection: RowSelection; onDialog: (state: ProjectDialogState) => void }) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const selected = selection.isSelected(project.id);
  return (
    <Card data-selected={selected || undefined} data-testid="project-card" className="group relative min-w-0 transition-shadow hover:shadow-md data-selected:ring-2 data-selected:ring-primary">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <span className={cn("mt-0.5 flex transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100", selection.count > 0 && "sm:opacity-100")}>
            <RowSelectCheckbox id={project.id} label={project.name} selection={selection} />
          </span>
          <Link href={`/projects/${project.id}`} className="grid min-w-0 flex-1 gap-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="inline-block size-3 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
              <CardTitle className="truncate" title={project.name}>{project.name}</CardTitle>
            </span>
            <UserAttribution userId={project.managerId} relation="managedBy" />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-xs" aria-label={t("projectActions", { name: project.name })} />}>
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onDialog({ kind: "edit", project })}><Pencil className="mr-2 size-4" />{tCommon("edit")}</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDialog({ kind: "archive", project })}><Archive className="mr-2 size-4" />{t("archive")}</DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={() => onDialog({ kind: "delete", project })}><Trash2 className="mr-2 size-4" />{t("deleteProject")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {project.description && <CardDescription className="line-clamp-2">{project.description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <Link href={`/projects/${project.id}`} className="text-sm text-muted-foreground">{t("openTasks", { count: project.openTasks })}</Link>
      </CardContent>
    </Card>
  );
}
