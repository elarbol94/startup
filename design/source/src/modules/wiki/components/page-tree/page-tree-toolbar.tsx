"use client";

import { useTranslations } from "next-intl";
import { ChevronsDownUp, ChevronsUpDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pageStatuses } from "./page-tree-types";

export function PageTreeToolbar({ query, onQuery, status, onStatus, tag, onTag, tagOptions, searching, onClear, canCollapse, allCollapsed, onToggleAll }: {
  query: string;
  onQuery: (value: string) => void;
  status: string;
  onStatus: (value: string) => void;
  tag: string;
  onTag: (value: string) => void;
  tagOptions: { id: string; name: string }[];
  searching: boolean;
  onClear: () => void;
  canCollapse: boolean;
  allCollapsed: boolean;
  onToggleAll: () => void;
}) {
  const t = useTranslations("wiki");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1">
        <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
        <Input aria-label={t("searchDocuments")} value={query} onChange={(event) => onQuery(event.target.value)} placeholder={t("searchDocuments")} className="pl-9" />
      </div>
      <Select value={status} onValueChange={(value) => onStatus(value ?? "all")}>
        <SelectTrigger aria-label={t("workspace.filterStatus")} className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">{t("workspace.allStatuses")}</SelectItem>{pageStatuses.map((item) => <SelectItem key={item} value={item}>{t(`pageStatuses.${item}`)}</SelectItem>)}</SelectContent>
      </Select>
      {tagOptions.length > 0 && <Select value={tag} onValueChange={(value) => onTag(value ?? "all")}>
        <SelectTrigger aria-label={t("workspace.filterTag")} className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="all">{t("allTags")}</SelectItem>{tagOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
      </Select>}
      {searching ? (
        <Button variant="ghost" size="sm" onClick={onClear}><X className="size-4" />{t("workspace.clearFilters")}</Button>
      ) : canCollapse && (
        <Button variant="ghost" size="sm" onClick={onToggleAll}>
          {allCollapsed ? <ChevronsUpDown className="size-4" /> : <ChevronsDownUp className="size-4" />}{t(allCollapsed ? "workspace.expandAll" : "workspace.collapseAll")}
        </Button>
      )}
    </div>
  );
}
