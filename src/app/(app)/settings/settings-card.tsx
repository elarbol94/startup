import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Radio-like choice (design 1b): 42 px, selected option gets a brand border on brand-soft. */
export const settingsChoiceClass =
  "flex h-[42px] cursor-pointer items-center gap-2 rounded-lg border px-4 text-[13.5px] font-medium transition-colors hover:bg-accent has-checked:border-brand has-checked:bg-brand-soft has-focus-visible:ring-2 has-focus-visible:ring-ring has-disabled:cursor-not-allowed has-disabled:opacity-60";
export const settingsRadioClass = "size-3.5 accent-[var(--brand)]";

/** One settings section (design 1b card): header with title, short description and actions. */
export function SettingsCard({
  title,
  description,
  descriptionId,
  actions,
  className,
  contentClassName,
  children,
  ...props
}: Omit<ComponentProps<"section">, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  descriptionId?: string;
  actions?: ReactNode;
  contentClassName?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-xl border bg-card shadow-card", className)} {...props}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line-soft px-[18px] py-3.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description ? <p id={descriptionId} className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className={cn("px-[18px] py-4", contentClassName)}>{children}</div>
    </section>
  );
}
