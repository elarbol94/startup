import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Short empty state (design 1b): icon tile, one-line title, one sentence, one or two actions. */
export function EmptyState({
  icon,
  title,
  description,
  actions,
  compact = false,
  className,
}: {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn("flex flex-col items-center gap-1.5 text-center", compact ? "px-4 py-6" : "px-6 py-10", className)}
    >
      <span aria-hidden className="mb-1.5 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-ink [&_svg]:size-[18px]">
        {icon}
      </span>
      <p className="text-[14.5px] font-semibold">{title}</p>
      {description ? <p className="max-w-[360px] text-[13.5px] leading-normal text-pretty text-muted-foreground">{description}</p> : null}
      {actions ? <div className="mt-2.5 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  )
}
