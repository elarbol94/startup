"use client";

// Tasks / Knowledge / Activity switch of the project page, with its 1–3 keyboard shortcuts.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookOpen, History, KanbanSquare } from "lucide-react";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { useKeyboardShortcuts } from "@/components/use-keyboard-shortcut";
import { requestAppNavigation } from "@/lib/app-navigation";
import { PROJECT_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
import { ariaKeyShortcuts } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

export type ProjectView = "tasks" | "knowledge" | "activity";

export function ProjectViewTabs({ projectId, view }: { projectId: string; view: ProjectView }) {
  const t = useTranslations("projects");
  const router = useRouter();
  const tabs = [
    { id: "tasks", href: `/projects/${projectId}`, icon: KanbanSquare, label: t("viewTasks"), shortcut: PROJECT_PAGE_SHORTCUTS.viewTasks },
    { id: "knowledge", href: `/projects/${projectId}?view=knowledge`, icon: BookOpen, label: t("viewKnowledge"), shortcut: PROJECT_PAGE_SHORTCUTS.viewKnowledge },
    { id: "activity", href: `/projects/${projectId}?view=activity`, icon: History, label: t("viewActivity"), shortcut: PROJECT_PAGE_SHORTCUTS.viewActivity },
  ] as const;
  useKeyboardShortcuts(tabs.map((tab) => ({
    shortcut: tab.shortcut,
    handler: () => {
      if (tab.id !== view) requestAppNavigation(tab.href, () => router.push(tab.href));
    },
  })));

  return (
    <nav
      aria-label={t("projectView")}
      className="ml-auto flex rounded-lg border bg-muted/40 p-1"
    >
      {tabs.map((tab) => (
        <ShortcutTooltip key={tab.id} label={tab.label} shortcut={tab.shortcut}>
          <Link
            href={tab.href}
            aria-current={view === tab.id ? "page" : undefined}
            aria-keyshortcuts={ariaKeyShortcuts(tab.shortcut)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              view === tab.id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </Link>
        </ShortcutTooltip>
      ))}
    </nav>
  );
}
