"use client";

import { useTranslations } from "next-intl";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectionBar } from "@/components/selection-bar";
import type { RowSelection } from "@/lib/use-row-selection";
import type { ProjectListItem } from "./project-card";

export function ProjectsBulkBar({ selection, projects, pending, onStatus, onDelete }: {
  selection: RowSelection;
  projects: ProjectListItem[];
  pending: boolean;
  onStatus: (ids: string[], status: "active" | "archived") => void;
  onDelete: (ids: string[]) => void;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const ids = selection.selectedIds;
  const selected = projects.filter((project) => selection.isSelected(project.id));
  const active = selected.filter((project) => project.status === "active").map((project) => project.id);
  const archived = selected.filter((project) => project.status === "archived").map((project) => project.id);
  return (
    <SelectionBar count={selection.count} onClear={selection.clear}>
      {active.length > 0 && <Button variant="ghost" size="sm" disabled={pending} onClick={() => onStatus(active, "archived")}><Archive className="size-4" />{t("archive")}</Button>}
      {archived.length > 0 && <Button variant="ghost" size="sm" disabled={pending} onClick={() => onStatus(archived, "active")}><ArchiveRestore className="size-4" />{t("unarchive")}</Button>}
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => onDelete(ids)}><Trash2 className="size-4" />{tCommon("delete")}</Button>
    </SelectionBar>
  );
}
