"use client";

import { useEffect, useRef } from "react";
import { PanelTop, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { moduleNavItemForPath } from "@/modules/registry";

function TabIcon({ href }: { href: string }) {
  let pathname = href;
  try {
    pathname = new URL(href, "http://workspace.local").pathname;
  } catch {
    // Keep the raw value; an unknown path falls back to the page icon.
  }
  const item = moduleNavItemForPath(pathname);
  return item ? <item.icon aria-hidden className="size-3.5 shrink-0" /> : <PanelTop aria-hidden className="size-3.5 shrink-0" />;
}

/** One entry of the workspace tab strip: a tab button plus, for opened tabs, a close button. */
export function WorkspaceTab({
  id,
  href,
  title,
  active,
  closeLabel,
  onSelect,
  onClose,
}: {
  id: string;
  href: string;
  title: string;
  active: boolean;
  closeLabel: string;
  onSelect: () => void;
  onClose?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Narrow strips scroll; keep the active tab in view (e.g. after Alt+Q or opening a tab).
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  return (
    <div
      ref={ref}
      className={cn(
        "group/tab flex h-8 max-w-[220px] shrink-0 items-center rounded-md border",
        active
          ? "border-border bg-card text-foreground shadow-card"
          : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <button
        type="button"
        id={`workspace-tab-${id}`}
        role="tab"
        aria-selected={active}
        aria-controls={`workspace-panel-${id}`}
        tabIndex={active ? 0 : -1}
        title={title}
        onClick={onSelect}
        className={cn(
          "flex h-full min-w-0 items-center gap-2 rounded-md pl-3 text-[13px] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          onClose ? "pr-1" : "pr-3",
          active && "font-medium",
        )}
      >
        <TabIcon href={href} />
        <span className="min-w-0 truncate">{title}</span>
      </button>
      {onClose && (
        <button
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
          className={cn(
            "mr-1 grid size-[18px] shrink-0 place-items-center rounded-[5px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:opacity-100",
            active ? "opacity-70" : "opacity-0 group-hover/tab:opacity-70",
          )}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
