"use client";

import { useTranslations } from "next-intl";
import { Search, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { pageStatuses, type PageStatus } from "../page-tree/page-tree-types";

export type WorkspaceFilters = { query: string; status: PageStatus | "all"; tag: string; favoritesOnly: boolean };
export const noWorkspaceFilters: WorkspaceFilters = { query: "", status: "all", tag: "all", favoritesOnly: false };

export function WorkspaceFilterBar({ filters, onChange, tags }: { filters: WorkspaceFilters; onChange: (next: WorkspaceFilters) => void; tags: string[] }) {
  const t = useTranslations("wiki");
  const set = (patch: Partial<WorkspaceFilters>) => onChange({ ...filters, ...patch });
  const hasFilters = Boolean(filters.query || filters.status !== "all" || filters.tag !== "all" || filters.favoritesOnly);
  return (
    <div className="rounded-xl border bg-card p-3 shadow-xs">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
          <Input aria-label={t("searchNotes")} value={filters.query} onChange={(event) => set({ query: event.target.value })} placeholder={t("searchNotes")} className="pl-9" />
        </div>
        <Select value={filters.status} onValueChange={(value) => set({ status: (value ?? "all") as PageStatus | "all" })}>
          <SelectTrigger aria-label={t("allPageStatuses")} className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allPageStatuses")}</SelectItem>
            {pageStatuses.map((status) => <SelectItem key={status} value={status}>{t(`pageStatuses.${status}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filters.tag} onValueChange={(value) => set({ tag: value ?? "all" })}>
          <SelectTrigger aria-label={t("allTags")} className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allTags")}</SelectItem>
            {tags.map((tag) => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={filters.favoritesOnly ? "secondary" : "outline"} onClick={() => set({ favoritesOnly: !filters.favoritesOnly })}>
          <Star className={cn("size-4", filters.favoritesOnly && "fill-indigo-400 text-indigo-500")} />
          {t("favoritesOnly")}
        </Button>
      </div>
      {hasFilters && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{t("activeFilters")}</span>
          {filters.query && <Button variant="secondary" size="xs" onClick={() => set({ query: "" })}>{filters.query}<X /></Button>}
          {filters.status !== "all" && <Button variant="secondary" size="xs" onClick={() => set({ status: "all" })}>{t(`pageStatuses.${filters.status}`)}<X /></Button>}
          {filters.tag !== "all" && <Button variant="secondary" size="xs" onClick={() => set({ tag: "all" })}>{filters.tag}<X /></Button>}
          {filters.favoritesOnly && <Button variant="secondary" size="xs" onClick={() => set({ favoritesOnly: false })}>{t("favorites")}<X /></Button>}
          <Button variant="ghost" size="xs" onClick={() => onChange(noWorkspaceFilters)}>{t("clearFilters")}</Button>
        </div>
      )}
    </div>
  );
}
