"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileText, LibraryBig, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { RowSelectCheckbox, SelectAllCheckbox } from "@/components/row-selection";
import { SelectionBar } from "@/components/selection-bar";
import type { BulkOutcome } from "@/lib/bulk";
import { cn } from "@/lib/utils";
import { useBulkAction } from "@/lib/use-bulk-action";
import { useRowSelection } from "@/lib/use-row-selection";
import { purgeTrashItems, restoreTrashItems } from "../trash-bulk-actions";

export type TrashRow = { type: "page" | "source"; id: string; title: string; deletedAtLabel: string };

const keyOf = (row: Pick<TrashRow, "type" | "id">) => `${row.type}:${row.id}`;

/** Trashed pages and sources; selection keys are `type:id` because both kinds mix here. */
export function TrashList({ rows, canPurge }: { rows: TrashRow[]; canPurge: boolean }) {
  const t = useTranslations("wiki");
  const tSelection = useTranslations("common.selection");
  const keys = useMemo(() => rows.map(keyOf), [rows]);
  const byKey = useMemo(() => new Map(rows.map((row) => [keyOf(row), row])), [rows]);
  const selection = useRowSelection(keys);
  const { run, pending } = useBulkAction(selection.deselect);
  const [confirmDialog, confirm] = useConfirm();
  const items = (selected: readonly string[]) => selected.map((key) => byKey.get(key)).filter((row): row is TrashRow => Boolean(row)).map(({ type, id }) => ({ type, id }));

  function reportSkipped(outcome: BulkOutcome | null) {
    if (!outcome?.skipped.length) return;
    toast.info(t("bulk.skippedList", { items: outcome.skipped.map((item) => `${byKey.get(item.id)?.title ?? item.id} (${tSelection(`skipReasons.${item.reason}`)})`).join(", ") }), { duration: 10_000 });
  }
  async function restore(selected: readonly string[]) {
    reportSkipped(await run(() => restoreTrashItems({ items: items(selected) }), { done: (outcome) => t("bulk.restored", { count: outcome.succeededIds.length }) }));
  }
  async function purge(selected: readonly string[]) {
    const ok = await confirm({ title: t("bulk.purge"), description: t("bulk.purgeConfirm", { count: selected.length }), confirmLabel: t("bulk.purge"), destructive: true });
    if (ok) reportSkipped(await run(() => purgeTrashItems({ items: items(selected) }), { done: (outcome) => t("bulk.purged", { count: outcome.succeededIds.length }) }));
  }

  return <>
    <div className="divide-y rounded-xl border">
      <div className="flex h-9 items-center gap-3 bg-muted/30 px-4 text-xs text-muted-foreground">
        <SelectAllCheckbox selection={selection} />
        <span>{selection.count > 0 ? t("bulk.selectedOf", { count: selection.count, total: rows.length }) : tSelection("selectAll")}</span>
      </div>
      {rows.map((row) => {
        const key = keyOf(row);
        return (
          <div key={key} data-testid="trash-row" data-selected={selection.isSelected(key) || undefined} className="group flex flex-wrap items-center gap-3 p-4 data-selected:bg-accent/60">
            <span className={cn("inline-flex transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100", selection.count > 0 && "sm:opacity-100")}>
              <RowSelectCheckbox id={key} label={row.title} selection={selection} />
            </span>
            {row.type === "page" ? <FileText className="size-4 text-indigo-400" /> : <LibraryBig className="size-4 text-indigo-400" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{row.title}</p>
              <p className="text-xs text-muted-foreground">{row.deletedAtLabel}</p>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => void restore([key])}><RotateCcw className="size-3.5" />{t("restore")}</Button>
              {canPurge && <Button size="sm" variant="ghost" disabled={pending} onClick={() => void purge([key])}><Trash2 className="size-3.5 text-destructive" />{t("purge")}</Button>}
            </div>
          </div>
        );
      })}
    </div>
    <SelectionBar count={selection.count} onClear={selection.clear}>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => void restore(selection.selectedIds)}><RotateCcw className="size-4" />{t("bulk.restore")}</Button>
      {canPurge && <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => void purge(selection.selectedIds)}><Trash2 className="size-4" />{t("bulk.purge")}</Button>}
    </SelectionBar>
    {confirmDialog}
  </>;
}
