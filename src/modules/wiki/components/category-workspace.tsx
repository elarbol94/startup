"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRight, FolderTree, Highlighter, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CategoryEvidence, CategoryRow } from "../category-queries";
import { createCategory, deleteCategory, moveEvidenceToCategory, renameCategory } from "../category-actions";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { WIKI_PAGE_CLASS } from "./wiki-page-class";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EvidencePanel } from "./evidence-panel";

type Category = CategoryRow & { depth: number };

export function CategoryWorkspace({ categories, selectedId, evidence }: {
  categories: Category[];
  selectedId: string;
  evidence: CategoryEvidence[];
}) {
  const t = useTranslations("wiki");
  const router = useRouter();
  const [draftName, setDraftName] = useState("");
  const [busy, setBusy] = useState(false);
  const selected = categories.find((category) => category.id === selectedId);

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    try {
      await work();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("categories.actionFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function addCategory(parentId: string | null) {
    const name = draftName.trim() || t("categories.untitled");
    await run(async () => {
      const created = await createCategory({ name, parentId });
      setDraftName("");
      router.push(`/wiki/categories?id=${created.id}`);
    });
  }

  return (
    <div className={WIKI_PAGE_CLASS}>
      <PageHeader title={t("categories.title")} description={t("categories.description")} />
      <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-xl border bg-card shadow-card">
          <form
            className="flex gap-1.5 border-b border-line-soft p-3"
            onSubmit={(event) => { event.preventDefault(); void addCategory(null); }}
          >
            <Input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder={t("categories.newPlaceholder")}
              aria-label={t("categories.newPlaceholder")}
              className="h-8"
            />
            <Button type="submit" size="icon" disabled={busy} aria-label={t("categories.newPlaceholder")}><Plus className="size-4" /></Button>
          </form>

          {categories.length === 0 ? (
            <EmptyState compact icon={<FolderTree />} title={t("categories.empty")} />
          ) : (
            <nav className="flex flex-col gap-0.5 p-2" aria-label={t("categories.title")}>
              {categories.map((category) => (
                <div key={category.id} className={cn("group flex items-center gap-0.5 rounded-md transition-colors", category.id === selectedId ? "bg-brand-soft text-brand-ink" : "text-text-secondary hover:bg-accent hover:text-foreground")} style={{ paddingLeft: `${category.depth * 14}px` }}>
                  <Link
                    href={`/wiki/categories?id=${category.id}`}
                    aria-current={category.id === selectedId ? "page" : undefined}
                    className="flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-[13.5px] font-medium outline-none focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <ChevronRight className="size-3 shrink-0 opacity-60" />
                    <span className="min-w-0 flex-1 truncate">{category.name}</span>
                    <span className="shrink-0 text-[11px] opacity-80 tabular-nums">{category.evidenceCount}</span>
                  </Link>
                  <Button
                    type="button" size="icon-sm" variant="ghost" disabled={busy} className="mr-1 text-current opacity-70 hover:bg-background hover:opacity-100"
                    title={t("categories.addChild")} aria-label={t("categories.addChild")}
                    onClick={() => void addCategory(category.id)}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
              ))}
            </nav>
          )}
        </aside>

        <section className="min-w-0 space-y-4">
          {!selected ? (
            <div className="rounded-xl border bg-card shadow-card"><EmptyState icon={<FolderTree />} title={t("categories.selectPrompt")} /></div>
          ) : (
            <>
              <header className="flex flex-wrap items-center gap-2 border-b border-line-soft pb-3">
                <Input
                  key={selected.id}
                  defaultValue={selected.name}
                  aria-label={t("categories.rename")}
                  className="h-9 max-w-md bg-card text-[14.5px] font-semibold md:text-[14.5px]"
                  onBlur={(event) => {
                    const name = event.target.value.trim();
                    if (!name || name === selected.name) return;
                    void run(() => renameCategory({ id: selected.id, name }));
                  }}
                />
                <span className="text-xs text-muted-foreground">{t("categories.evidenceCount", { count: evidence.length })}</span>
                <Button
                  type="button" size="xs" variant="ghost" disabled={busy}
                  className="ml-auto text-destructive hover:text-destructive"
                  onClick={() => {
                    if (!confirm(t("categories.deleteConfirm"))) return;
                    void run(async () => { await deleteCategory(selected.id); router.push("/wiki/categories"); });
                  }}
                >
                  <Trash2 className="size-3.5" />{t("delete")}
                </Button>
              </header>

              {/* The same panel every other evidence target uses, so filing a passage under
                  an outline entry works exactly like linking it to a project or invoice. */}
              <EvidencePanel targetType="wikiCategory" targetId={selected.id} compact />

              {evidence.length === 0 ? (
                <div className="rounded-xl border bg-card shadow-card"><EmptyState icon={<Highlighter />} title={t("categories.noEvidence")} /></div>
              ) : (
                <ul className="space-y-3">
                  {evidence.map((item) => (
                    <li key={item.linkId} className="rounded-xl border bg-card px-[18px] py-3 text-[13.5px] shadow-card">
                      <div className="flex flex-wrap items-center gap-2">
                        <Highlighter className="size-4 shrink-0 text-muted-foreground" />
                        <Link
                          href={`/wiki/sources/${item.sourceId}/read/${item.documentId}?page=${item.pageNumber}&annotation=${item.annotationId}`}
                          className="font-medium hover:underline"
                        >
                          {item.sourceTitle}
                        </Link>
                        <span className="text-xs text-muted-foreground">{t("pageNumber", { page: item.pageNumber })}</span>
                        {categories.length > 1 && (
                          <Select
                            value={selected.id}
                            onValueChange={(value) => {
                              if (!value || value === selected.id) return;
                              void run(() => moveEvidenceToCategory({ linkId: item.linkId, categoryId: value }));
                            }}
                          >
                            <SelectTrigger aria-label={t("categories.moveTo")} className="ml-auto h-7 w-48 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {categories.map((category) => (
                                <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                      {item.selectedText && <blockquote className="mt-2 border-l-2 border-line-strong pl-3 italic text-muted-foreground">“{item.selectedText}”</blockquote>}
                      {item.note && <p className="mt-2">{item.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
