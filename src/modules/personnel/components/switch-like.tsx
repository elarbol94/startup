"use client";

import { cn } from "@/lib/utils";

export function SwitchLike({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-[13.5px]">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card", checked ? "bg-brand" : "bg-line-strong")}
      >
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow-sm transition-[left]", checked ? "left-[1.125rem]" : "left-0.5")} />
      </button>
    </div>
  );
}
