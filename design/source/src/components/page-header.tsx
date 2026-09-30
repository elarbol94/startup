import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared compact page header used by every section: optional eyebrow, title,
 * one-line description and right-aligned actions. Keep marketing copy out of
 * `description` — one short sentence at most.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  icon,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      data-slot="page-header"
      className={cn("mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6", className)}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon ? (
          <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4.5">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{eyebrow}</p>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.7rem]">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div> : null}
    </header>
  );
}
