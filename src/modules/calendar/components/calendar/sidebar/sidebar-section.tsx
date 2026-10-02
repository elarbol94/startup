// Small titled section used throughout the calendar sidebar and the filters dialog.
// Used by the files in this folder and calendar-filters-dialog.tsx.
export function SidebarSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-1.5 flex min-h-5 items-center justify-between gap-2">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
