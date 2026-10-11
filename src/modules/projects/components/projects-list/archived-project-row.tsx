"use client";

import { useTranslations } from "next-intl";
import { ArchiveRestore, Trash2 } from "lucide-react";
import { UserAttribution } from "@/components/user-identity";
import { RowSelectCheckbox } from "@/components/row-selection";
import { Button } from "@/components/ui/button";
import type { RowSelection } from "@/lib/use-row-selection";
import type { ProjectListItem } from "./project-row";

export function ArchivedProjectRow({ project, selection, onRestore, onDelete }: { project: ProjectListItem; selection: RowSelection; onRestore: () => void; onDelete: () => void }) {
  const t = useTranslations("projects");
  return (
    <div data-selected={selection.isSelected(project.id) || undefined} className="flex items-center gap-3 px-[18px] py-[11px] transition-colors hover:bg-accent data-selected:bg-brand-soft">
      <RowSelectCheckbox id={project.id} label={project.name} selection={selection} />
      <span className="inline-block size-2 shrink-0 rounded-[3px] opacity-50" style={{ backgroundColor: project.color }} />
      <span className="min-w-0 flex-1 text-[13.5px] text-muted-foreground">
        {project.name}<br /><UserAttribution userId={project.managerId} relation="managedBy" />
      </span>
      <span className="inline-flex h-5 items-center rounded-full border border-line-strong px-2 text-[11px] font-medium text-text-secondary max-sm:hidden">{t("archived")}</span>
      <Button variant="ghost" size="icon-xs" title={t("unarchive")} aria-label={t("unarchive")} onClick={onRestore}><ArchiveRestore className="size-3.5" /></Button>
      <Button variant="ghost" size="icon-xs" aria-label={t("deleteProject")} onClick={onDelete}><Trash2 className="size-3.5" /></Button>
    </div>
  );
}
