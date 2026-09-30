"use client";

import { useTranslations } from "next-intl";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { UserAttribution } from "@/components/user-identity";
import { RowSelectCheckbox } from "@/components/row-selection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RowSelection } from "@/lib/use-row-selection";
import type { ProjectListItem } from "./project-card";

export function ArchivedProjectRow({ project, selection, onRestore, onDelete }: { project: ProjectListItem; selection: RowSelection; onRestore: () => void; onDelete: () => void }) {
  const t = useTranslations("projects");
  return (
    <div data-selected={selection.isSelected(project.id) || undefined} className="flex items-center gap-3 px-3 py-2 data-selected:bg-accent/60">
      <RowSelectCheckbox id={project.id} label={project.name} selection={selection} />
      <span className="inline-block size-2.5 rounded-full opacity-50" style={{ backgroundColor: project.color }} />
      <span className="min-w-0 flex-1 text-sm text-muted-foreground">
        {project.name}<br /><UserAttribution userId={project.managerId} relation="managedBy" />
      </span>
      <Badge variant="secondary" className="max-sm:hidden">{t("archived")}</Badge>
      <Button variant="ghost" size="icon-xs" title={t("unarchive")} aria-label={t("unarchive")} onClick={onRestore}><ArchiveRestore className="size-3.5" /></Button>
      <Button variant="ghost" size="icon-xs" aria-label={t("deleteProject")} onClick={onDelete}><Trash2 className="size-3.5" /></Button>
    </div>
  );
}
