"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CalendarClock,
  CalendarPlus,
  ClipboardPlus,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react";
import { useFocusMode } from "@/components/focus-mode";
import { UserMenu } from "@/components/user-menu";
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
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ShortcutKeys, ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { useKeyboardShortcuts } from "@/components/use-keyboard-shortcut";
import { GLOBAL_SHORTCUTS, NAVIGATION_SHORTCUTS } from "@/lib/app-shortcuts";
import { cn } from "@/lib/utils";
import { requestAppNavigation } from "@/lib/app-navigation";
import { moduleNav, navSectionAliases, type ModuleNavItem } from "@/modules/registry";
import { useTaskCreator } from "@/modules/tasks/components/task-create-provider";
import { useDeadlineCreator } from "@/modules/tasks/components/deadline-create-provider";
import { WorkspaceSearch } from "@/modules/context/components/workspace-search";
import { projectIdFromPath, withProjectParam } from "@/modules/projects/current-project";

const NAVIGATION_ORDER_STORAGE_KEY = "app-navigation-order:v1";

function orderedNavigationItems(order: string[]): ModuleNavItem[] {
  const itemsByKey = new Map(moduleNav.map((item) => [item.key, item]));
  const savedItems = order.flatMap((key) => {
    const item = itemsByKey.get(key as ModuleNavItem["key"]);
    if (!item) return [];
    itemsByKey.delete(item.key);
    return [item];
  });
  return [...savedItems, ...itemsByKey.values()];
}

function loadNavigationOrder(): string[] {
  const defaultOrder = moduleNav.map((item) => item.key);
  if (typeof window === "undefined") return defaultOrder;
  try {
    const stored = JSON.parse(window.localStorage.getItem(NAVIGATION_ORDER_STORAGE_KEY) ?? "[]");
    return Array.isArray(stored) && stored.every((item) => typeof item === "string")
      ? orderedNavigationItems(stored).map((item) => item.key)
      : defaultOrder;
  } catch {
    return defaultOrder;
  }
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
  compact,
  onNavigate,
  shortcut,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  compact: boolean;
  onNavigate?: () => void;
  shortcut?: string;
}) {
  const link = (
    <Link
      href={href}
      aria-label={compact ? label : undefined}
      onClick={onNavigate}
      className={cn(
        "flex h-10 items-center rounded-md text-sm font-medium transition-colors",
        compact ? "justify-center gap-0 px-0" : "gap-3 px-3",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
      )}
    >
      <Icon className="size-5" />
      <span
        aria-hidden={compact}
        className={cn(
          "min-w-0 truncate whitespace-nowrap transition-all duration-[220ms] ease-out motion-reduce:transition-none",
          compact ? "max-w-0 -translate-x-1 overflow-hidden opacity-0" : "max-w-44 translate-x-0 opacity-100",
        )}
      >
        {label}
      </span>
    </Link>
  );

  return <ShortcutTooltip label={label} shortcut={shortcut} side="right">{link}</ShortcutTooltip>;
}

function SortableNavLink({
  item,
  label,
  active,
  compact,
  onActivate,
  suppressNavigationUntilRef,
}: {
  item: ModuleNavItem;
  label: string;
  active: boolean;
  compact: boolean;
  onActivate: () => void;
  suppressNavigationUntilRef: React.RefObject<number>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerMovedRef = useRef(false);
  const Icon = item.icon;

  const button = (
    <button
      type="button"
      ref={setNodeRef}
      data-navigation-key={item.key}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      aria-label={compact ? label : undefined}
      className={cn(
        "flex h-10 w-full items-center rounded-md text-sm font-medium transition-colors",
        compact ? "justify-center gap-0 px-0" : "gap-3 px-3",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
        isDragging && "z-10 opacity-45",
      )}
      onPointerDownCapture={(event) => {
        pointerStartRef.current = { x: event.clientX, y: event.clientY };
        pointerMovedRef.current = false;
      }}
      onPointerMoveCapture={(event) => {
        const start = pointerStartRef.current;
        if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) return;
        pointerMovedRef.current = true;
        suppressNavigationUntilRef.current = Number.POSITIVE_INFINITY;
      }}
      onPointerCancelCapture={() => {
        pointerStartRef.current = null;
        pointerMovedRef.current = false;
        suppressNavigationUntilRef.current = Date.now() + 500;
      }}
      onPointerUpCapture={() => {
        if (pointerMovedRef.current) {
          suppressNavigationUntilRef.current = Date.now() + 500;
        }
        pointerStartRef.current = null;
      }}
      onClick={(event) => {
        if (pointerMovedRef.current || Date.now() < suppressNavigationUntilRef.current) {
          event.preventDefault();
          event.stopPropagation();
          pointerMovedRef.current = false;
          return;
        }
        onActivate();
      }}
      {...attributes}
      {...listeners}
    >
      <Icon className="size-5" />
      <span
        aria-hidden={compact}
        className={cn(
          "min-w-0 truncate whitespace-nowrap transition-all duration-[220ms] ease-out motion-reduce:transition-none",
          compact ? "max-w-0 -translate-x-1 overflow-hidden opacity-0" : "max-w-44 translate-x-0 opacity-100",
        )}
      >
        {label}
      </span>
    </button>
  );

  return (
    <ShortcutTooltip label={label} shortcut={NAVIGATION_SHORTCUTS[item.key]} side="right" disabled={isDragging}>
      {button}
    </ShortcutTooltip>
  );
}

/** Shortcut hints are only useful with a physical keyboard / fine pointer. */
const KEYBOARD_HINT_CLASS = "hidden pointer-fine:inline-flex";

function QuickCreateMenu({ compact, onNavigate }: { compact: boolean; onNavigate?: () => void }) {
  const t = useTranslations("nav");
  const router = useRouter();
  const { openTaskCreator } = useTaskCreator();
  const { openDeadlineCreator } = useDeadlineCreator();
  const currentProjectId = projectIdFromPath(usePathname());

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            aria-label={compact ? t("quickCreate") : undefined}
            title={compact ? t("quickCreate") : undefined}
            className={cn("mb-2 h-10 w-full justify-start", compact ? "justify-center gap-0 px-0" : "gap-3 px-3")}
          />
        }
      >
        <Plus className="size-5" />
        <span
          aria-hidden={compact}
          className={cn(
            "min-w-0 truncate whitespace-nowrap transition-all duration-[220ms] ease-out motion-reduce:transition-none",
            compact ? "max-w-0 overflow-hidden opacity-0" : "max-w-44 opacity-100",
          )}
        >
          {t("new")}
        </span>
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
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppNavigation({
  compact,
  pathname,
  userName,
  userEmail,
  onNavigate,
  navigationId,
  onOpenSearch,
  onDragStateChange,
}: {
  compact: boolean;
  pathname: string;
  userName: string;
  userEmail: string;
  onNavigate?: () => void;
  navigationId: string;
  onOpenSearch: () => void;
  onDragStateChange?: (dragging: boolean) => void;
}) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const suppressNavigationUntilRef = useRef(0);
  const [navigationOrder, setNavigationOrder] = useState<string[]>(loadNavigationOrder);
  const navigationItems = useMemo(() => orderedNavigationItems(navigationOrder), [navigationOrder]);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      // Enter activates a section; Space starts keyboard reordering.
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );
  const isActive = (href: string) => {
    const section = `/${href.split("/")[1]}`;
    if (href === "/") return pathname === "/";
    const currentSection = `/${pathname.split("/")[1]}`;
    const effectiveSection = navSectionAliases[currentSection] ?? currentSection;
    return effectiveSection === section;
  };

  function reorderNavigation(activeId: string, overId: string) {
    const oldIndex = navigationOrder.indexOf(activeId);
    const newIndex = navigationOrder.indexOf(overId);
    if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
      const next = arrayMove(navigationOrder, oldIndex, newIndex);
      setNavigationOrder(next);
      window.localStorage.setItem(NAVIGATION_ORDER_STORAGE_KEY, JSON.stringify(next));
    }
  }

  function handleNavigationDragEnd(event: DragEndEvent) {
    if (event.over) reorderNavigation(String(event.active.id), String(event.over.id));
    suppressNavigationUntilRef.current = Date.now() + 500;
  }

  return (
    <TooltipProvider>
      <div className="flex min-h-0 flex-1 flex-col">
        <nav
          id={navigationId}
          aria-label={t("navigationLabel")}
          className={cn("flex flex-1 flex-col gap-1 overflow-y-auto", compact ? "px-2 py-3" : "p-3")}
        >
          <QuickCreateMenu compact={compact} onNavigate={onNavigate} />
          <ShortcutTooltip label={tCommon("search")} shortcut={GLOBAL_SHORTCUTS.search} side="right">
          <button
            type="button"
            onClick={() => {
              onOpenSearch();
              onNavigate?.();
            }}
            className={cn(
              "mb-2 flex h-10 items-center rounded-md border border-dashed text-sm font-medium text-muted-foreground transition-colors hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-foreground dark:hover:bg-indigo-950/20",
              compact ? "justify-center px-0" : "gap-3 px-3",
            )}
            aria-label={tCommon("search")}
            aria-keyshortcuts="Control+K Meta+K"
          >
            <Search className="size-5" />
            <span
              aria-hidden={compact}
              className={cn(
                "min-w-0 truncate whitespace-nowrap transition-all duration-[220ms]",
                compact
                  ? "max-w-0 overflow-hidden opacity-0"
                  : "max-w-44 opacity-100",
              )}
            >
              {tCommon("search")}
            </span>
            {!compact && <ShortcutKeys shortcut={GLOBAL_SHORTCUTS.search} className={cn("ml-auto", KEYBOARD_HINT_CLASS)} />}
          </button>
          </ShortcutTooltip>
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
            <SortableContext items={navigationItems.map((item) => item.key)} strategy={verticalListSortingStrategy}>
              {navigationItems.map((item) => (
                <SortableNavLink
                  key={item.key}
                  item={item}
                  label={t(item.key)}
                  active={isActive(item.href)}
                  compact={compact}
                  onActivate={() => {
                    requestAppNavigation(item.href, () => {
                      router.push(item.href);
                      onNavigate?.();
                    });
                  }}
                  suppressNavigationUntilRef={suppressNavigationUntilRef}
                />
              ))}
            </SortableContext>
          </DndContext>
          <div className="mt-auto flex flex-col gap-1">
            <NavLink
              href="/settings"
              label={t("settings")}
              icon={Settings}
              active={isActive("/settings")}
              compact={compact}
              onNavigate={onNavigate}
              shortcut={NAVIGATION_SHORTCUTS.settings}
            />
          </div>
        </nav>
        <div className={cn("border-t", compact ? "px-2 py-3" : "p-3")}>
          <UserMenu name={userName} email={userEmail} compact={compact} onNavigate={onNavigate} />
        </div>
      </div>
    </TooltipProvider>
  );
}

export function AppSidebar({
  userName,
  userEmail,
  companyName,
}: {
  userName: string;
  userEmail: string;
  companyName?: string;
}) {
  const t = useTranslations("nav");
  const tCommon = useTranslations("common");
  const productName = companyName?.trim() || tCommon("appName");
  const pathname = usePathname();
  const { isFocused } = useFocusMode();
  const [expanded, setExpanded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const desktopPointerInsideRef = useRef(false);
  const desktopDragRef = useRef(false);
  const router = useRouter();
  useKeyboardShortcuts(
    [...moduleNav, { key: "settings" as const, href: "/settings" }].map((item) => ({
      shortcut: NAVIGATION_SHORTCUTS[item.key],
      handler: () => requestAppNavigation(item.href, () => router.push(item.href)),
    })),
  );

  function handleDesktopDragStateChange(dragging: boolean) {
    desktopDragRef.current = dragging;
    if (dragging) setExpanded(true);
    else if (!desktopPointerInsideRef.current) setExpanded(false);
  }
  useEffect(() => {
    document.documentElement.style.setProperty("--app-rail-width", expanded ? "15rem" : "3.5rem");
    return () => { document.documentElement.style.removeProperty("--app-rail-width"); };
  }, [expanded]);

  if (isFocused) return null;

  return (
    <>
      <header data-testid="app-mobile-header" className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b bg-sidebar/95 px-3 backdrop-blur md:hidden">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("openNavigation")}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="size-5" />
        </Button>
        <Link href="/" title={productName} className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
          {productName}
        </Link>
        <Button type="button" variant="ghost" size="icon" aria-label={tCommon("search")} onClick={() => setSearchOpen(true)}>
          <Search className="size-5" />
        </Button>
        <UserMenu name={userName} email={userEmail} compact />
      </header>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          data-testid="app-navigation-sheet"
          side="left"
          showCloseButton={false}
          className="w-[min(20rem,88vw)] gap-0 p-0 md:hidden"
        >
          <SheetHeader className="flex-row items-center gap-2 border-b p-3 pr-2">
            <LayoutDashboard className="size-5 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate">{productName}</SheetTitle>
              <SheetDescription className="sr-only">{t("navigationDescription")}</SheetDescription>
            </div>
            <SheetClose render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("closeNavigation")} />}>
              <X className="size-4" />
            </SheetClose>
          </SheetHeader>
          <AppNavigation
            compact={false}
            navigationId="app-mobile-navigation"
            pathname={pathname}
            userName={userName}
            userEmail={userEmail}
            onNavigate={() => setMobileOpen(false)}
            onOpenSearch={() => setSearchOpen(true)}
          />
        </SheetContent>
      </Sheet>

      <aside
        data-testid="app-sidebar"
        data-expanded={expanded}
        className={cn(
          "app-rail-transition fixed inset-y-0 left-0 z-40 hidden h-dvh shrink-0 flex-col border-r bg-sidebar duration-[220ms] ease-out motion-reduce:transition-none md:flex",
          expanded ? "w-60" : "w-14",
        )}
        onMouseEnter={() => {
          desktopPointerInsideRef.current = true;
          setExpanded(true);
        }}
        onMouseLeave={() => {
          desktopPointerInsideRef.current = false;
          if (!desktopDragRef.current) setExpanded(false);
        }}
        onFocusCapture={() => setExpanded(true)}
        onBlur={(event) => {
          if (!desktopDragRef.current && !event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
        }}
      >
        <div className="flex h-14 shrink-0 items-center overflow-hidden border-b px-4">
          <Link
            href="/"
            title={productName}
            aria-hidden={!expanded}
            tabIndex={expanded ? 0 : -1}
            className={cn(
              "truncate whitespace-nowrap text-base font-semibold tracking-tight transition-all duration-[220ms] ease-out motion-reduce:transition-none",
              expanded ? "translate-x-0 opacity-100" : "-translate-x-1 opacity-0",
            )}
          >
            {productName}
          </Link>
        </div>
        <AppNavigation
          compact={!expanded}
          navigationId="app-primary-navigation"
          pathname={pathname}
          userName={userName}
          userEmail={userEmail}
          onOpenSearch={() => setSearchOpen(true)}
          onDragStateChange={handleDesktopDragStateChange}
        />
      </aside>
      <WorkspaceSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
