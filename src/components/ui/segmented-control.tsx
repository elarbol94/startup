"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type SegmentedOption<T extends string> = { value: T; label: ReactNode; icon?: ReactNode; ariaLabel?: string }

/**
 * Small single-choice switch (design 1b), e.g. "Meine | Alle". `value` may match no
 * option (nothing is selected then, e.g. when a filter picked a specific person).
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onValueChange,
  disabled,
  className,
}: {
  label: string
  options: SegmentedOption<T>[]
  value: T | null
  onValueChange: (value: T) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-slot="segmented-control"
      className={cn("inline-flex shrink-0 gap-0.5 rounded-[10px] border bg-muted p-[3px]", className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.ariaLabel}
            disabled={disabled}
            data-active={active || undefined}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "inline-flex h-[26px] items-center gap-1.5 rounded-[7px] px-2.5 text-[12.5px] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 max-md:h-9 [&_svg]:size-3.5",
              active && "bg-card text-foreground shadow-sm dark:bg-secondary dark:shadow-none",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
