"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { PanelLeftOpen, Search, Settings } from "lucide-react";
import { UserMenu } from "@/components/user-menu";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { GLOBAL_SHORTCUTS, NAVIGATION_SHORTCUTS } from "@/lib/app-shortcuts";
import { ariaKeyShortcuts } from "@/lib/shortcuts";
import { requestAppNavigation } from "@/lib/app-navigation";
import { cn } from "@/lib/utils";
import { NavGroupLabel, NavLink, SortableNavLink, navItemClass } from "./nav-items";
import { QuickCreateMenu } from "./quick-create-menu";
import { ThemeToggle } from "./theme-toggle";
import {
  NAVIGATION_ORDER_STORAGE_KEY,
  groupedNavigationItems,
  isNavItemActive,
  parseNavigationOrder,
  reorderWithinGroup,
} from "./sidebar-model";

function loadNavigationOrder(): string[] {
  if (typeof window === "undefined") return parseNavigationOrder(null);
  try {
    return parseNavigationOrder(window.localStorage.getItem(NAVIGATION_ORDER_STORAGE_KEY));
  } catch {
    return parseNavigationOrder(null);
  }
}

/** Sidebar body shared by the desktop sidebar and the phone sheet: actions, grouped modules, footer. */
export function AppNavigation({
  compact,
  pathname,
  userName,
  userEmail,
  onNavigate,
  navigationId,
  onOpenSearch,
  onExpand,
  onDragStateChange,
}: {
  compact: boolean;
  pathname: string;
  userName: string;
  userEmail: string;
  onNavigate?: () => void;
  navigationId: string;
  onOpenSearch: () => void;
  /** Shown in the icon rail to widen the sidebar again. */
  onExpand?: () => void;
  onDragStateChange?: (dragging: boolean) => void;
}) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const suppressNavigationUntilRef = useRef(0);
  const [navigationOrder, setNavigationOrder] = useState<string[]>(loadNavigationOrder);
  const groups = useMemo(() => groupedNavigationItems(navigationOrder), [navigationOrder]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter activates a section; Space starts keyboard reordering.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  function handleNavigationDragEnd(event: DragEndEvent) {
    const next = event.over ? reorderWithinGroup(navigationOrder, String(event.active.id), String(event.over.id)) : null;
    if (next) {
      setNavigationOrder(next);
      try {
        window.localStorage.setItem(NAVIGATION_ORDER_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // The new order still applies until reload.
      }
    }
    suppressNavigationUntilRef.current = Date.now() + 500;
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-0 flex-1 flex-col">
        <nav
          id={navigationId}
          aria-label={t("navigationLabel")}
          className={cn("flex flex-1 flex-col gap-0.5 overflow-x-hidden overflow-y-auto", compact ? "px-2 py-3" : "p-3")}
        >
          <div className={cn("mb-1 flex shrink-0 gap-2", compact && "flex-col")}>
            <QuickCreateMenu compact={compact} onNavigate={onNavigate} />
            <ShortcutTooltip label={tCommon("search")} shortcut={GLOBAL_SHORTCUTS.search} side="right">
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                className={cn("bg-transparent text-text-secondary", compact && "w-full")}
                aria-label={tCommon("search")}
                aria-keyshortcuts={ariaKeyShortcuts(GLOBAL_SHORTCUTS.search)}
                onClick={() => {
                  onOpenSearch();
                  onNavigate?.();
                }}
              >
                <Search className="size-4" />
              </Button>
            </ShortcutTooltip>
          </div>
          <DndContext
            id="app-sidebar-navigation"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={() => {
              suppressNavigationUntilRef.current = Number.POSITIVE_INFINITY;
              onDragStateChange?.(true);
            }}
            onDragEnd={(event) => {
              handleNavigationDragEnd(event);
              onDragStateChange?.(false);
            }}
            onDragCancel={() => {
              suppressNavigationUntilRef.current = Date.now() + 500;
              onDragStateChange?.(false);
            }}
          >
            {groups.map(({ group, items }) => {
              const labelId = `${navigationId}-group-${group}`;
              return (
                <div key={group} role="group" aria-labelledby={labelId} className="flex flex-col gap-0.5">
                  <NavGroupLabel id={labelId} label={t(`groups.${group}`)} compact={compact} />
                  <SortableContext items={items.map((item) => item.key)} strategy={verticalListSortingStrategy}>
                    {items.map((item) => (
                      <SortableNavLink
                        key={item.key}
                        item={item}
                        label={t(item.key)}
                        active={isNavItemActive(item.href, pathname)}
                        compact={compact}
                        onActivate={() => {
                          // Close the menu even when an active workspace tab takes the navigation.
                          onNavigate?.();
                          requestAppNavigation(item.href, () => router.push(item.href));
                        }}
                        suppressNavigationUntilRef={suppressNavigationUntilRef}
                      />
                    ))}
                  </SortableContext>
                </div>
              );
            })}
          </DndContext>
          <div className="mt-auto flex flex-col gap-0.5 pt-3">
            <NavLink
              href="/settings"
              label={t("settings")}
              icon={Settings}
              active={isNavItemActive("/settings", pathname)}
              compact={compact}
              onNavigate={onNavigate}
              shortcut={NAVIGATION_SHORTCUTS.settings}
            />
            {compact && onExpand && (
              <ShortcutTooltip label={t("expandNavigation")} side="right">
                <button type="button" aria-label={t("expandNavigation")} className={navItemClass(false, true)} onClick={onExpand}>
                  <PanelLeftOpen className="size-[18px]" />
                </button>
              </ShortcutTooltip>
            )}
          </div>
        </nav>
        <div className={cn("flex items-center gap-1 border-t border-sidebar-border", compact ? "flex-col px-2 py-3" : "px-3 py-2.5")}>
          <div className={cn("min-w-0", !compact && "flex-1")}>
            <UserMenu name={userName} email={userEmail} compact={compact} onNavigate={onNavigate} />
          </div>
          <ThemeToggle />
        </div>
      </div>
    </TooltipProvider>
  );
}
