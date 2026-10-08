"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarClock, ClipboardPlus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { GLOBAL_SHORTCUTS } from "@/lib/app-shortcuts";
import { deleteSource, toggleFavorite } from "../research-actions";
import { useTaskCreator } from "@/modules/tasks/components/task-create-provider";
import { useDeadlineCreator } from "@/modules/tasks/components/deadline-create-provider";

export function SourcePageActions({ sourceId, sourceTitle }: { sourceId: string; sourceTitle: string }) {
  const t = useTranslations("wiki");
  const tTasks = useTranslations("tasks");
  const tDeadlines = useTranslations("deadlines");
  const router = useRouter();
  const { openTaskCreator } = useTaskCreator();
  const { openDeadlineCreator } = useDeadlineCreator();
  const origin = { type: "wikiSource", entityId: sourceId, route: `/wiki/sources/${sourceId}`, label: sourceTitle } as const;
  return (
    <div className="flex gap-1">
      <ShortcutTooltip label={tTasks("createTask")} shortcut={GLOBAL_SHORTCUTS.newTask}>
        <Button variant="ghost" size="icon-sm" aria-label={tTasks("createTask")} onClick={() => openTaskCreator({ origin })}><ClipboardPlus className="size-4" /></Button>
      </ShortcutTooltip>
      <ShortcutTooltip label={tDeadlines("createDeadline")} shortcut={GLOBAL_SHORTCUTS.newDeadline}>
        <Button variant="ghost" size="icon-sm" aria-label={tDeadlines("createDeadline")} onClick={() => openDeadlineCreator({ origin })}><CalendarClock className="size-4" /></Button>
      </ShortcutTooltip>
      <Button variant="ghost" size="icon-sm" title={t("favorite")} onClick={async () => { await toggleFavorite("source", sourceId); router.refresh(); }}><Star className="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" title={t("deleteSource")} onClick={async () => { if (!confirm(t("deleteSourceConfirm"))) return; await deleteSource(sourceId); router.push("/wiki/sources"); }}><Trash2 className="size-4 text-destructive" /></Button>
    </div>
  );
}
