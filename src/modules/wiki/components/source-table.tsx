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
  /** Raw reading status (`toRead`, `reading`, `read`) for the pill style. */
  status: string;
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
    <div className="mt-4 overflow-x-auto rounded-xl border bg-card shadow-card">
      <table className="w-full min-w-[900px] text-[13.5px]">
        <thead className="border-b text-left text-[11.5px] font-medium whitespace-nowrap text-muted-foreground">
          <tr className="h-9">
            <th className="w-10 pl-[18px] font-medium"><SelectAllCheckbox selection={selection} /></th>
            <th className="px-3 font-medium">{t("sourceTitle")}</th><th className="px-3 font-medium">{t("contributors")}</th><th className="px-3 font-medium">{t("year")}</th><th className="px-3 font-medium">{t("sourceType")}</th><th className="px-3 font-medium">{t("readingStatus")}</th><th className="px-3 font-medium">PDF</th><th className="px-3 pr-[18px] text-right font-medium">{t("evidence")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {rows.map((row) => (
            <tr key={row.id} data-selected={selection.isSelected(row.id) || undefined} className="group transition-colors hover:bg-accent data-selected:bg-brand-soft">
              <td className="py-2.5 pl-[18px] align-top"><span className={cn("inline-flex pt-0.5 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100", selection.count > 0 && "sm:opacity-100")}><RowSelectCheckbox id={row.id} label={row.title} selection={selection} /></span></td>
              <td className="max-w-sm px-3 py-2.5">
                <Link href={row.href} className="font-medium hover:underline">{row.title}</Link>
                {row.tags.length > 0 && <p className="mt-1 flex flex-wrap gap-1">{row.tags.map((tag) => <Link key={tag.id} href={`/wiki/tags/${tag.id}`} className="inline-flex h-5 items-center rounded-full bg-muted px-2 text-[11px] font-medium text-text-secondary transition-colors hover:bg-brand-soft hover:text-brand-ink">{tag.name}</Link>)}</p>}
              </td>
              <td className="max-w-xs truncate px-3 py-2.5 text-muted-foreground">{row.contributors || "—"}</td>
              <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{row.year || "—"}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{row.typeLabel}</td>
              <td className="px-3 py-2.5"><span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold whitespace-nowrap", row.status === "reading" ? "bg-brand-soft text-brand-ink" : row.status === "read" ? "bg-muted text-text-secondary" : "border border-line-strong font-medium text-text-secondary")}>{row.statusLabel}</span></td>
              <td className="px-3 py-2.5 text-xs whitespace-nowrap">{row.pdf ? row.pdf.href ? <Link className="font-medium text-brand-ink hover:underline" href={row.pdf.href}>{row.pdf.label}</Link> : <span className={row.pdf.failed ? "text-destructive" : "text-muted-foreground"}>{row.pdf.label}</span> : "—"}</td>
              <td className="px-3 py-2.5 pr-[18px] text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums">
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
