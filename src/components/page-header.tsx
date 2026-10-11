import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared compact page header used by every section (design 1b): optional eyebrow, title,
 * one-line description and right-aligned actions. On phones the actions move under the
 * title and a primary button stretches. Keep marketing copy out of `description` — one
 * short sentence at most. Module sub-navigation goes below it (`SubNav`).
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      data-slot="page-header"
      className={cn("mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-6", className)}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[11px] font-semibold tracking-[0.14em] text-brand-ink uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="text-[22px] leading-[1.2] font-semibold tracking-[-0.025em] text-foreground sm:text-[26px]">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-[13.5px] text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 max-sm:w-full sm:justify-end max-sm:[&>[data-slot=button][data-variant=default]]:flex-1">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
