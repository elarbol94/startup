"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** A tag known to the dialog; `count` is how many of the selected rows carry it. */
export type TagEditOption = { key: string; name: string; count: number };
/** Tag names to add to every selected row and tag keys to remove from every one. */
export type TagChange = { add: string[]; remove: string[] };

type Target = "all" | "none" | "keep";

/**
 * Adds or removes tags across several rows without replacing each row's tag set.
 * Tags on some rows start "mixed" and stay untouched until clicked.
 */
export function TagEditDialog({
  open,
  onOpenChange,
  options,
  selectedCount,
  maxLength = 40,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: TagEditOption[];
  selectedCount: number;
  maxLength?: number;
  onSubmit: (change: TagChange) => void | Promise<void>;
}) {
  const t = useTranslations("common.tags");
  const tCommon = useTranslations("common");
  const [targets, setTargets] = useState<Map<string, Target>>(new Map());
  const [created, setCreated] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setTargets(new Map()); setCreated([]); setQuery(""); }
  }
  const initial = (option: TagEditOption): Target => option.count >= selectedCount ? "all" : option.count === 0 ? "none" : "keep";
  const clean = query.trim();
  const normalized = clean.toLocaleLowerCase();
  const shown = useMemo(() => options.filter((option) => !normalized || option.name.toLocaleLowerCase().includes(normalized)), [normalized, options]);
  const exists = options.some((option) => option.name.toLocaleLowerCase() === normalized) || created.some((name) => name.toLocaleLowerCase() === normalized);

  function cycle(option: TagEditOption) {
    const start = initial(option);
    const current = targets.get(option.key) ?? start;
    // Mixed tags cycle through all → none → back to untouched; others just flip.
    const next: Target = current === "all" ? "none" : current === "none" ? (start === "keep" ? "keep" : "all") : "all";
    setTargets(new Map(targets).set(option.key, next));
  }
  const change: TagChange = {
    add: [
      ...options.filter((option) => targets.get(option.key) === "all" && initial(option) !== "all").map((option) => option.name),
      ...created,
    ],
    remove: options.filter((option) => targets.get(option.key) === "none" && initial(option) !== "none").map((option) => option.key),
  };
  const dirty = change.add.length + change.remove.length > 0;

  async function submit() {
    if (!dirty) return;
    setPending(true);
    try {
      await onSubmit(change);
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }
  function create() {
    if (!clean || exists) return;
    setCreated([...created, clean.slice(0, maxLength)]);
    setQuery("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="tag-edit-dialog">
        <DialogHeader>
          <DialogTitle>{t("editTitle", { count: selectedCount })}</DialogTitle>
          <DialogDescription>{t("editDescription")}</DialogDescription>
        </DialogHeader>
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); create(); }}>
          <Input aria-label={t("addPlaceholder")} placeholder={t("addPlaceholder")} value={query} maxLength={maxLength} onChange={(event) => setQuery(event.target.value)} />
          <Button type="submit" variant="outline" disabled={!clean || exists}><Plus className="size-4" />{t("create")}</Button>
        </form>
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {created.map((name) => (
            <label key={`new:${name}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
              <Checkbox checked onCheckedChange={() => setCreated(created.filter((item) => item !== name))} />
              <span className="flex-1 truncate">{name}</span>
              <span className="text-xs text-muted-foreground">{t("new")}</span>
            </label>
          ))}
          {shown.map((option) => {
            const target = targets.get(option.key) ?? initial(option);
            return (
              <label key={option.key} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={target === "all"} indeterminate={target === "keep"} onClick={(event) => { event.preventDefault(); cycle(option); }} />
                <span className="flex-1 truncate">{option.name}</span>
                {target === "keep" && <span className="text-xs text-muted-foreground tabular-nums">{t("mixed", { count: option.count, total: selectedCount })}</span>}
              </label>
            );
          })}
          {shown.length === 0 && created.length === 0 && <p className="px-2 py-4 text-center text-sm text-muted-foreground">{t("noTags")}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tCommon("cancel")}</Button>
          <Button type="button" disabled={!dirty || pending} onClick={() => void submit()}>{t("apply")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
