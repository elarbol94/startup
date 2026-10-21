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
import { toast } from "sonner";
import { UserMenu } from "@/components/user-menu";
import { ShareMenu } from "@/components/share/share-menu";
import { currentPageShareTarget } from "@/components/share/share-target";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { GLOBAL_SHORTCUTS, NAVIGATION_SHORTCUTS } from "@/lib/app-shortcuts";
import { ariaKeyShortcuts } from "@/lib/shortcuts";
import { requestAppNavigation } from "@/lib/app-navigation";
import { cn } from "@/lib/utils";
import { isNavItemActive, type ModuleNavGroup } from "@/modules/registry";
import { NavLink, SortableNavLink, navItemClass } from "./nav-items";
import { SortableNavGroup } from "./nav-group";
import { QuickCreateMenu } from "./quick-create-menu";
import { ThemeToggle } from "./theme-toggle";
import { saveSidebarGroupLayout } from "./sidebar-layout-actions";
import {
  NAVIGATION_ORDER_STORAGE_KEY,
  groupedNavigationItems,
  moveGroup,
  parseNavigationOrder,
  reorderWithinGroup,
  type SidebarGroupLayout,
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
  showShare = true,
  groupLayout,
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
  /** The phone header has its own share button, so the phone sheet leaves it out. */
  showShare?: boolean;
  /** The user's saved group order and collapsed groups. */
  groupLayout: SidebarGroupLayout;
}) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const tShare = useTranslations("share");
  const router = useRouter();
  const suppressNavigationUntilRef = useRef(0);
  const [navigationOrder, setNavigationOrder] = useState<string[]>(loadNavigationOrder);
  const [layout, setLayout] = useState<SidebarGroupLayout>(groupLayout);
  const groups = useMemo(() => groupedNavigationItems(navigationOrder, layout.order), [navigationOrder, layout.order]);

  /** Group order and collapsed groups are kept per user on the server, so they follow the person across browsers. */
  function updateLayout(next: SidebarGroupLayout) {
    setLayout(next);
    saveSidebarGroupLayout(next).catch(() => toast.error(t("layoutSaveFailed")));
  }

  function handleGroupDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    const next = moveGroup(layout.order, String(event.active.id) as ModuleNavGroup, layout.order.indexOf(String(event.over.id) as ModuleNavGroup));
    if (next) updateLayout({ ...layout, order: next });
  }

  function toggleGroup(group: ModuleNavGroup) {
    const collapsed = layout.collapsed.includes(group)
      ? layout.collapsed.filter((item) => item !== group)
      : [...layout.collapsed, group];
    updateLayout({ ...layout, collapsed });
  }
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
            {showShare && (
              <ShareMenu
                target={currentPageShareTarget}
                label={tShare("sharePage")}
                size="icon-lg"
                className={cn("bg-transparent text-text-secondary", compact && "w-full")}
                align="start"
                side={compact ? "right" : "bottom"}
              />
            )}
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
            <DndContext id="app-sidebar-groups" sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleGroupDragEnd}>
              <SortableContext items={layout.order} strategy={verticalListSortingStrategy}>
                {groups.map(({ group, items }) => (
                  <SortableNavGroup
                    key={group}
                    group={group}
                    label={t(`groups.${group}`)}
                    navigationId={navigationId}
                    compact={compact}
                    collapsed={layout.collapsed.includes(group)}
                    onToggle={() => toggleGroup(group)}
                  >
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
                  </SortableNavGroup>
                ))}
              </SortableContext>
            </DndContext>
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
