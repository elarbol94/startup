"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CornerDownRight, FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { WorkspacePage } from "../../research-queries";
import { ancestorPath, buildPageTree, descendantIds } from "../../lib/page-tree";

const TOP_LEVEL = "__top__";

/**
 * Picks a new parent for the selected pages. The pages themselves and everything
 * below them are left out, so a page can never be moved into its own subtree.
 */
export function MovePagesDialog({ open, onOpenChange, pages, ids, onMove }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pages: WorkspacePage[];
  ids: readonly string[];
  onMove: (parentId: string | null) => void | Promise<void>;
}) {
  const t = useTranslations("wiki.movePages");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [choice, setChoice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setQuery(""); setChoice(null); }
  }
  const excluded = useMemo(() => descendantIds(pages, ids), [ids, pages]);
  const parents = new Set(pages.filter((page) => ids.includes(page.id)).map((page) => page.parentId ?? TOP_LEVEL));
  const current = parents.size === 1 ? [...parents][0] : null;
  const targets = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase(locale);
    return buildPageTree(pages)
      .filter((page) => !excluded.has(page.id))
      .map((page) => ({ page, path: ancestorPath(pages, page.id).map((item) => item.title) }))
      .filter(({ page, path }) => !clean || [page.title, ...path].some((value) => value.toLocaleLowerCase(locale).includes(clean)));
  }, [excluded, locale, pages, query]);

  async function submit() {
    if (!choice || choice === current) return;
    setPending(true);
    try {
      await onMove(choice === TOP_LEVEL ? null : choice);
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }
  const option = (value: string, label: ReactNode, detail?: string) => (
    <button
      key={value}
      type="button"
      role="option"
      aria-selected={choice === value}
      disabled={value === current}
      onClick={() => setChoice(value)}
      className={cn("flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50", choice === value && "bg-accent text-accent-foreground")}
    >
      {label}
      {detail && <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">{detail}</span>}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="move-pages-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title", { count: ids.length })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input aria-label={t("search")} placeholder={t("search")} value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" />
        </div>
        <div role="listbox" aria-label={t("targets")} className="max-h-72 space-y-0.5 overflow-y-auto">
          {!query.trim() && option(TOP_LEVEL, <><CornerDownRight className="size-4 shrink-0 text-muted-foreground" /><span className="font-medium">{t("topLevel")}</span></>, current === TOP_LEVEL ? t("current") : undefined)}
          {targets.map(({ page, path }) => option(
            page.id,
            <><FileText className="size-4 shrink-0 text-muted-foreground/60" /><span className="truncate">{page.title}</span></>,
            page.id === current ? t("current") : path.join(" / ") || undefined,
          ))}
          {targets.length === 0 && query.trim() && <p className="px-2 py-4 text-center text-sm text-muted-foreground">{t("noTargets")}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tCommon("cancel")}</Button>
          <Button type="button" disabled={!choice || choice === current || pending} onClick={() => void submit()}>{t("submit")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
