"use client";

import { useRef } from "react";
import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { NAVIGATION_SHORTCUTS } from "@/lib/app-shortcuts";
import { cn } from "@/lib/utils";
import type { ModuleNavItem } from "@/modules/registry";

export function navItemClass(active: boolean, compact: boolean) {
  return cn(
    "flex h-9 w-full shrink-0 items-center rounded-md text-[13.5px] font-medium transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    compact ? "justify-center px-0" : "gap-2.5 px-2.5",
    active
      ? "bg-brand-soft text-brand-ink"
      : "text-text-secondary hover:bg-accent hover:text-foreground",
  );
}

function NavLabel({ label, compact }: { label: string; compact: boolean }) {
  return compact ? null : <span className="min-w-0 flex-1 truncate text-left">{label}</span>;
}

/** Group heading; in the icon rail it shrinks to a divider and stays available to screen readers. */
export function NavGroupLabel({ id, label, compact }: { id: string; label: string; compact: boolean }) {
  return compact ? (
    <div className="mx-1.5 my-2.5 h-px shrink-0 bg-sidebar-border">
      <span id={id} className="sr-only">{label}</span>
    </div>
  ) : (
    <div id={id} className="shrink-0 truncate px-2.5 pt-4 pb-1.5 text-[10.5px] font-semibold tracking-[0.14em] text-text-tertiary uppercase">
      {label}
    </div>
  );
}

export function NavLink({
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
  return (
    <ShortcutTooltip label={label} shortcut={shortcut} side="right">
      <Link
        href={href}
        aria-label={compact ? label : undefined}
        aria-current={active ? "page" : undefined}
        onClick={onNavigate}
        className={navItemClass(active, compact)}
      >
        <Icon className="size-[18px] shrink-0" />
        <NavLabel label={label} compact={compact} />
      </Link>
    </ShortcutTooltip>
  );
}

export function SortableNavLink({
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

  return (
    <ShortcutTooltip label={label} shortcut={NAVIGATION_SHORTCUTS[item.key]} side="right" disabled={isDragging}>
      <button
        type="button"
        ref={setNodeRef}
        data-navigation-key={item.key}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        aria-label={compact ? label : undefined}
        aria-current={active ? "page" : undefined}
        className={cn(navItemClass(active, compact), isDragging && "z-10 opacity-45")}
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
        <Icon className="size-[18px] shrink-0" />
        <NavLabel label={label} compact={compact} />
      </button>
    </ShortcutTooltip>
  );
}
