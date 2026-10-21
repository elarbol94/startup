"use client";
// The right-click menu of Edit Points (vertex or segment items, as in PowerPoint).
// Used by edit-points-overlay.tsx.
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

export type EditPointsMenuItem = { key: string; label: string; run: () => void; checked?: boolean; separatorBefore?: boolean; disabled?: boolean };

export function EditPointsMenu({ position, items, label, onClose }: { position: { x: number; y: number }; items: EditPointsMenuItem[]; label: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const away = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) close.current(); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); event.preventDefault(); close.current(); } };
    const blur = () => close.current();
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", blur);
    };
  }, []);
  return createPortal(
    <div ref={ref} role="menu" aria-label={label} data-presentation-overlay data-testid="presentation-edit-points-menu"
      className="fixed z-50 min-w-48 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ left: Math.min(position.x, window.innerWidth - 210), top: Math.min(position.y, window.innerHeight - items.length * 34 - 16) }}
      onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}
      onPointerDown={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const buttons = [...ref.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(index + (event.key === "ArrowDown" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
      }}>
      {items.map(item => (
        <div key={item.key}>
          {item.separatorBefore && <div className="-mx-1 my-1 h-px bg-border" />}
          <button type="button" role={item.checked === undefined ? "menuitem" : "menuitemradio"} aria-checked={item.checked} disabled={item.disabled}
            data-edit-points-action={item.key}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:bg-accent disabled:opacity-50"
            onClick={() => { item.run(); onClose(); }}>
            <Check className={item.checked ? "size-3.5" : "size-3.5 invisible"} aria-hidden />{item.label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
