"use client";

import { useEffect, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Floating toolbar for bulk actions, shown while rows are selected. Escape clears
 * the selection unless a dialog or menu is open (their own Escape wins).
 */
export function SelectionBar({ count, onClear, children, className }: { count: number; onClear: () => void; children: ReactNode; className?: string }) {
  const t = useTranslations("common.selection");
  useEffect(() => {
    if (count === 0) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector("[role=dialog], [role=alertdialog], [role=menu], [role=listbox]")) return;
      onClear();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [count, onClear]);
  if (count === 0) return null;
  return (
    <div className="pointer-events-none sticky bottom-4 z-30 flex justify-center">
      <div
        role="toolbar"
        aria-label={t("toolbar")}
        data-testid="selection-bar"
        className={cn("pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-xl border bg-popover px-2 py-1.5 text-sm shadow-lg", className)}
      >
        <span role="status" className="px-2 font-medium tabular-nums">{t("count", { count })}</span>
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        {children}
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        <Button variant="ghost" size="sm" onClick={onClear} aria-label={t("clear")}><X className="size-4" /><span className="max-sm:hidden">{t("clear")}</span></Button>
      </div>
    </div>
  );
}
