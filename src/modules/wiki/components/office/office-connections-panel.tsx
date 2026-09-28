"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { BookMarked, CalendarClock, CheckSquare, FileSearch } from "lucide-react";
import type { OfficeConnections } from "../../office/queries";
import type { OfficeCommand } from "./use-office-bridge";

type Kind = Extract<OfficeCommand, { command: "select" }>["kind"];

/**
 * What the document links to (tasks, deadlines, cited sources, PDF evidence).
 * Clicking an entry selects its passage in the editor through the plugin.
 */
export function OfficeConnectionsPanel({ pageId, refreshKey, onSelect }: {
  pageId: string; refreshKey: string | number; onSelect: (kind: Kind, id: string) => void;
}) {
  const t = useTranslations("officeDocuments.connections");
  const [data, setData] = useState<OfficeConnections | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/wiki/office/${encodeURIComponent(pageId)}/connections`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<OfficeConnections> : null)
      .then((next) => { if (!cancelled && next) setData(next); }, () => undefined);
    return () => { cancelled = true; };
  }, [pageId, refreshKey]);

  if (!data) return null;
  const groups: Array<{ kind: Kind; label: string; icon: typeof CheckSquare; items: Array<{ id: string; title: string; detail?: string; done?: boolean }> }> = [
    { kind: "task", label: t("tasks"), icon: CheckSquare, items: data.tasks.map((task) => ({ id: task.id, title: task.title, detail: task.dueDate ?? undefined, done: task.status === "done" })) },
    { kind: "deadline", label: t("deadlines"), icon: CalendarClock, items: data.deadlines.map((deadline) => ({ id: deadline.id, title: deadline.title, detail: deadline.dueDate ?? undefined, done: deadline.status === "done" })) },
    { kind: "cite", label: t("sources"), icon: BookMarked, items: data.sources.map((source) => ({ id: source.id, title: source.title, detail: source.issuedDate.slice(0, 4) || undefined })) },
    { kind: "evidence", label: t("evidence"), icon: FileSearch, items: data.evidence.map((item) => ({ id: item.id, title: item.selectedText || item.label || item.sourceTitle, detail: `${item.sourceTitle} · S. ${item.pageNumber}` })) },
  ];
  const empty = groups.every((group) => !group.items.length);

  return <section aria-labelledby="office-connections-title" className="space-y-3">
    <h2 id="office-connections-title" className="text-sm font-medium">{t("title")}</h2>
    {empty && <p className="text-xs text-muted-foreground">{t("empty")}</p>}
    {groups.filter((group) => group.items.length).map((group) => <div key={group.kind} className="space-y-1">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><group.icon className="size-3.5" />{group.label}</p>
      <ul className="space-y-0.5">
        {group.items.map((item) => <li key={item.id}>
          <button type="button" title={t("jump")} onClick={() => onSelect(group.kind, item.id)}
            className={`w-full rounded-md px-2 py-1 text-left text-sm hover:bg-accent ${item.done ? "text-muted-foreground line-through" : ""}`}>
            <span className="line-clamp-2">{item.title}</span>
            {item.detail && <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>}
          </button>
        </li>)}
      </ul>
    </div>)}
  </section>;
}
