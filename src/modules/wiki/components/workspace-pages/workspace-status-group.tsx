"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { RowSelection } from "@/lib/use-row-selection";
import type { PageStatus } from "../page-tree/page-tree-types";

/** One status section of the inbox; its header checkbox selects the section's notes. */
export function WorkspaceStatusGroup({ status, ids, open, collapsible, onToggleOpen, selection, children }: {
  status: PageStatus;
  ids: string[];
  open: boolean;
  collapsible: boolean;
  onToggleOpen: () => void;
  selection: RowSelection;
  children: ReactNode;
}) {
  const t = useTranslations("wiki");
  const tSelection = useTranslations("common.selection");
  const selected = ids.filter((id) => selection.isSelected(id)).length;
  const label = t(`pageStatuses.${status}`);
  return (
    <section data-testid={`workspace-group-${status}`} className="overflow-hidden rounded-xl border bg-card shadow-card">
      <div className={cn("flex min-h-[52px] items-center justify-between gap-3 px-[18px] py-2.5", open && "border-b border-line-soft")}>
        <div className="flex items-center gap-3">
          {open && ids.length > 0 && (
            <Checkbox
              checked={selected > 0 && selected === ids.length}
              indeterminate={selected > 0 && selected < ids.length}
              aria-label={tSelection("selectRow", { name: label })}
              onClick={(event) => { event.preventDefault(); selection.setMany(ids, selected !== ids.length); }}
            />
          )}
          <h2 className="text-[14.5px] font-semibold">{label}</h2>
          <span className="text-xs text-muted-foreground tabular-nums">{ids.length}</span>
        </div>
        {collapsible && (
          <Button variant="ghost" size="sm" className="-mr-2 text-muted-foreground" onClick={onToggleOpen} aria-expanded={open}>
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
            {open ? t("collapse") : t("expand")}
          </Button>
        )}
      </div>
      {open && <div className="divide-y divide-line-soft">{children}</div>}
    </section>
  );
}
