"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import { requestWorkspaceTab } from "@/components/workspace/model";

const MENU_WIDTH = 200;
const MENU_HEIGHT = 40;

/** Right-click menu for a sidebar module: opens the page as a workspace tab. */
export function NavContextMenu({
  x,
  y,
  href,
  title,
  onClose,
}: {
  x: number;
  y: number;
  href: string;
  title: string;
  onClose: () => void;
}) {
  const t = useTranslations("nav");
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    itemRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // Any scroll or resize moves the page under the menu, so it closes rather than drifting.
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  // Keep the menu on screen when opened near the right or bottom edge.
  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 8);
  const top = Math.min(y, window.innerHeight - MENU_HEIGHT - 8);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      data-slot="nav-context-menu"
      style={{ left, top, width: MENU_WIDTH }}
      className="fixed z-50 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
    >
      <button
        ref={itemRef}
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
        onClick={() => {
          onClose();
          // Outside a workspace (or at the tab limit) fall back to a browser tab.
          if (!requestWorkspaceTab(href, title)) window.open(href, "_blank", "noopener");
        }}
      >
        <ExternalLink className="size-4 shrink-0" />
        {t("openInNewTab")}
      </button>
    </div>,
    document.body,
  );
}
