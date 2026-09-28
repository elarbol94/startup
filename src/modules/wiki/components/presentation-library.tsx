"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, Presentation, Search, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useTextPrompt } from "@/components/ui/text-prompt-dialog";
import { SelectionBar } from "@/components/selection-bar";
import { useBulkAction } from "@/lib/use-bulk-action";
import { useRowSelection } from "@/lib/use-row-selection";
import type { PresentationListItem } from "../presentation-queries";
import { PresentationImport } from "./presentation-import";
import { NewPresentationForm } from "./presentation-list-actions";
import { PresentationCard } from "./presentation-library/presentation-card";
import { renamePresentation } from "../presentation-actions";
import { deletePresentations } from "../presentation-bulk-actions";

export function PresentationLibrary({ presentations }: { presentations: PresentationListItem[] }) {
  const t = useTranslations("wiki");
  const tCommon = useTranslations("common");
  const studio = useTranslations("presentationStudio");
  const [creation, setCreation] = useState<"blank" | "import" | null>(null);
  const [query, setQuery] = useState("");
  const visible = presentations.filter((item) => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selectableIds = useMemo(() => visible.filter((item) => item.role === "owner").map((item) => item.id), [visible]);
  const selection = useRowSelection(selectableIds);
  const { run, pending } = useBulkAction(selection.deselect);
  const [confirmDialog, confirm] = useConfirm();
  const [promptDialog, prompt] = useTextPrompt();
  const router = useRouter();

  async function rename(item: PresentationListItem) {
    const title = await prompt({ title: t("presentations.renameTitle"), label: t("presentations.presentationTitle"), defaultValue: item.title, required: true, maxLength: 200, confirmLabel: tCommon("rename") });
    if (!title || title === item.title) return;
    try {
      await renamePresentation({ id: item.id, title });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error && error.message === "Presentation is locked" ? t("presentations.renameLocked") : tCommon("error"));
    }
  }
  async function remove(ids: string[]) {
    const title = ids.length === 1 ? presentations.find((item) => item.id === ids[0])?.title : undefined;
    const ok = await confirm({
      title: tCommon("confirmDeleteTitle"),
      description: title ? t("presentations.deleteConfirm", { title }) : t("presentations.bulkDeleteConfirm", { count: ids.length }),
      confirmLabel: t("presentations.deletePermanently"),
      destructive: true,
    });
    if (ok) await run(() => deletePresentations({ ids }), { done: (outcome) => t("presentations.deleted", { count: outcome.succeededIds.length }) });
  }

  return <div className="mx-auto max-w-7xl p-5 md:p-8">
    <PageHeader title={t("presentations.title")} description={t("presentations.description")} actions={<>
        <Button variant="ghost" render={<Link href="/wiki/presentations/follow" />} nativeButton={false}>{t("presentations.joinLive")}</Button>
        <DropdownMenu><DropdownMenuTrigger render={<Button />}><Plus className="size-4" />{t("presentations.new")}</DropdownMenuTrigger><DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setCreation("blank")}><Presentation />{t("workspace.blankOrTemplate")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setCreation("import")}><Upload />{studio("importPptx")}</DropdownMenuItem>
        </DropdownMenuContent></DropdownMenu>
    </>} />
    <NewPresentationForm hideTrigger open={creation === "blank"} onOpenChange={(open) => setCreation(open ? "blank" : null)} />
    <PresentationImport hideTrigger open={creation === "import"} onOpenChange={(open) => setCreation(open ? "import" : null)} />
    {presentations.length > 0 && <div className="relative mb-6 max-w-sm"><Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t("workspace.searchPresentations")} placeholder={t("workspace.searchPresentations")} /></div>}
    {!presentations.length ? <div className="grid min-h-72 place-items-center rounded-2xl bg-muted/30 p-8 text-center"><div><Presentation className="mx-auto mb-4 size-9 text-muted-foreground/60" /><h2 className="font-medium">{t("presentations.empty")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("presentations.emptyDescription")}</p></div></div>
      : !visible.length ? <p className="py-12 text-sm text-muted-foreground">{t("noSearchResults")}</p>
      : <ul className="grid gap-6 sm:grid-cols-2 2xl:grid-cols-3">{visible.map((item) => <PresentationCard key={item.id} item={item} selection={selection} onRename={() => void rename(item)} onDelete={() => void remove([item.id])} />)}</ul>}
    <SelectionBar count={selection.count} onClear={selection.clear}>
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={pending} onClick={() => void remove(selection.selectedIds)}><Trash2 className="size-4" />{t("presentations.deletePermanently")}</Button>
    </SelectionBar>
    {confirmDialog}
    {promptDialog}
  </div>;
}
