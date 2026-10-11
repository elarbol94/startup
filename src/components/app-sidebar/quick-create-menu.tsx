"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarClock, CalendarPlus, ClipboardPlus, Plus, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShortcutKeys } from "@/components/ui/shortcut-tooltip";
import { GLOBAL_SHORTCUTS } from "@/lib/app-shortcuts";
import { requestAppNavigation } from "@/lib/app-navigation";
import { cn } from "@/lib/utils";
import { useTaskCreator } from "@/modules/tasks/components/task-create-provider";
import { useDeadlineCreator } from "@/modules/tasks/components/deadline-create-provider";
import { useContactCapture } from "@/modules/network/components/contact-capture-provider";
import { projectIdFromPath, withProjectParam } from "@/modules/projects/current-project";

/** Shortcut hints are only useful with a physical keyboard / fine pointer. */
export const KEYBOARD_HINT_CLASS = "hidden pointer-fine:inline-flex";

export function QuickCreateMenu({ compact, onNavigate }: { compact: boolean; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const router = useRouter();
  const { openTaskCreator } = useTaskCreator();
  const { openDeadlineCreator } = useDeadlineCreator();
  const { openContactCapture, hasDraft: contactDraft } = useContactCapture();
  const currentProjectId = projectIdFromPath(usePathname());

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            aria-label={compact ? t("quickCreate") : undefined}
            title={compact ? t("quickCreate") : undefined}
            className={cn("h-9 justify-center", compact ? "w-full px-0" : "min-w-0 flex-1 gap-1.5 px-3")}
          />
        }
      >
        <Plus className="size-4" />
        {!compact && <span className="truncate">{t("new")}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {t("quickCreate")}
            {currentProjectId && (
              <span className="block text-[11px] font-normal text-muted-foreground">{t("quickCreateInProject")}</span>
            )}
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => {
              onNavigate?.();
              openTaskCreator();
            }}
          >
            <ClipboardPlus className="mr-1 size-4" />
            {t("newTask")}
            <DropdownMenuShortcut className={KEYBOARD_HINT_CLASS}><ShortcutKeys shortcut={GLOBAL_SHORTCUTS.newTask} /></DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              onNavigate?.();
              const href = withProjectParam("/calendar?new=event", currentProjectId);
              requestAppNavigation(href, () => router.push(href));
            }}
          >
            <CalendarPlus className="mr-1 size-4" />
            {t("newEvent")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              onNavigate?.();
              openDeadlineCreator();
            }}
          >
            <CalendarClock className="mr-1 size-4" />
            {t("newDeadline")}
            <DropdownMenuShortcut className={KEYBOARD_HINT_CLASS}><ShortcutKeys shortcut={GLOBAL_SHORTCUTS.newDeadline} /></DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="quick-create-contact"
            onClick={() => {
              onNavigate?.();
              openContactCapture();
            }}
          >
            <UserPlus className="mr-1 size-4" />
            {t("newContact")}
            {contactDraft && <DropdownMenuShortcut className="text-[11px] tracking-normal">{t("draft")}</DropdownMenuShortcut>}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
