"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { BookMarked, FileCheck2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { RowSelectCheckbox, SelectAllCheckbox } from "@/components/row-selection";
import { SelectionBar } from "@/components/selection-bar";
import { cn } from "@/lib/utils";
import { useBulkAction } from "@/lib/use-bulk-action";
import { useRowSelection } from "@/lib/use-row-selection";
import { deleteSources } from "../source-bulk-actions";
import { SourceListActions } from "./source-list-actions";

/** One library row, with labels resolved on the server. */
export type SourceTableRow = {
  id: string;
  title: string;
  href: string;
  tags: { id: string; name: string }[];
  contributors: string;
  year: string;
  typeLabel: string;
  statusLabel: string;
  pdf: { label: string; href?: string; failed?: boolean } | null;
  citationCount: number;
  attachmentCount: number;
};

export function SourceTable({ rows }: { rows: SourceTableRow[] }) {
  const t = useTranslations("wiki");
  const tCommon = useTranslations("common");
  const ids = useMemo(() => rows.map((row) => row.id), [rows]);
  const selection = useRowSelection(ids);
  const { run, pending } = useBulkAction(selection.deselect);
  const [confirmDialog, confirm] = useConfirm();

  async function trash(selected: string[]) {
    const ok = await confirm({ title: tCommon("confirmTrashTitle"), description: t("sourceBulk.trashConfirm", { count: selected.length }), confirmLabel: tCommon("moveToTrash"), destructive: true });
    if (ok) await run(() => deleteSources({ ids: selected }), { done: (outcome) => t("sourceBulk.trashed", { count: outcome.succeededIds.length }) });
  }

  return <>
    <div className="mt-4 overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-muted/50 text-left text-[11px] tracking-wider text-muted-foreground uppercase">
          <tr>
            <th className="w-10 py-2 pl-3"><SelectAllCheckbox selection={selection} /></th>
            <th className="px-3 py-2">{t("sourceTitle")}</th><th className="px-3 py-2">{t("contributors")}</th><th className="px-3 py-2">{t("year")}</th><th className="px-3 py-2">{t("sourceType")}</th><th className="px-3 py-2">{t("readingStatus")}</th><th className="px-3 py-2">PDF</th><th className="px-3 py-2 text-right">{t("evidence")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id} data-selected={selection.isSelected(row.id) || undefined} className="group hover:bg-indigo-50/50 data-selected:bg-accent/60 dark:hover:bg-indigo-950/20">
              <td className="py-3 pl-3 align-top"><span className={cn("inline-flex pt-0.5 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100", selection.count > 0 && "sm:opacity-100")}><RowSelectCheckbox id={row.id} label={row.title} selection={selection} /></span></td>
              <td className="max-w-sm px-3 py-3">
                <Link href={row.href} className="font-medium group-hover:text-indigo-700 dark:group-hover:text-indigo-300">{row.title}</Link>
                {row.tags.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{row.tags.map((tag) => <Link key={tag.id} href={`/wiki/tags/${tag.id}`} className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-200 dark:hover:bg-indigo-900">{tag.name}</Link>)}</p>}
              </td>
              <td className="max-w-xs truncate px-3 py-3 text-muted-foreground">{row.contributors || "—"}</td>
              <td className="px-3 py-3 tabular-nums text-muted-foreground">{row.year || "—"}</td>
              <td className="px-3 py-3 text-muted-foreground">{row.typeLabel}</td>
              <td className="px-3 py-3"><span className="rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">{row.statusLabel}</span></td>
              <td className="px-3 py-3 text-xs">{row.pdf ? row.pdf.href ? <Link className="font-medium text-indigo-600" href={row.pdf.href}>{row.pdf.label}</Link> : <span className={row.pdf.failed ? "text-destructive" : "text-muted-foreground"}>{row.pdf.label}</span> : "—"}</td>
              <td className="px-3 py-3 text-right text-xs text-muted-foreground">
                <span title={t("citations")} className="inline-flex items-center gap-1"><BookMarked className="size-3.5" />{row.citationCount}</span>
                <span title={t("attachments")} className="ml-3 inline-flex items-center gap-1"><FileCheck2 className="size-3.5" />{row.attachmentCount}</span>
                <span className="ml-2 inline-flex align-middle"><SourceListActions sourceId={row.id} title={row.title} onTrash={() => trash([row.id])} /></span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    <SelectionBar count={selection.count} onClear={selection.clear}>
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => void trash(selection.selectedIds)}><Trash2 className="size-4" />{tCommon("moveToTrash")}</Button>
    </SelectionBar>
    {confirmDialog}
  </>;
}
