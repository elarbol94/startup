"use client";

// Tasks / Knowledge / Activity underline tabs (design 1b) of the project page, with their 1–3 keyboard shortcuts.
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookOpen, History, KanbanSquare } from "lucide-react";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { SubNav, SubNavLink } from "@/components/ui/sub-nav";
import { useKeyboardShortcuts } from "@/components/use-keyboard-shortcut";
import { requestAppNavigation } from "@/lib/app-navigation";
import { PROJECT_PAGE_SHORTCUTS } from "@/lib/app-shortcuts";
import { ariaKeyShortcuts } from "@/lib/shortcuts";

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
    <SubNav label={t("projectView")}>
      {tabs.map((tab) => (
        <ShortcutTooltip key={tab.id} label={tab.label} shortcut={tab.shortcut}>
          <SubNavLink
            href={tab.href}
            active={view === tab.id}
            icon={<tab.icon />}
            aria-keyshortcuts={ariaKeyShortcuts(tab.shortcut)}
          >
            {tab.label}
          </SubNavLink>
        </ShortcutTooltip>
      ))}
    </SubNav>
  );
}
