"use client";

// Right-hand panel of the calendar page: the inspector for the selected item (floating on large
// screens, docked on 2xl, bottom sheet on phones) or the unscheduled-work tray.
// Used by calendar-client.tsx.
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { cn } from "@/lib/utils";
import { canonicalTaskHref } from "@/modules/context/routes";
import type { CalendarItem, CalendarWorkspace } from "../../types";
import { dragPayload } from "./calendar-drag-drop";
import { Inspector } from "./inspector";
import { UnscheduledTray } from "./unscheduled-tray";

export function CalendarDetailPanel({
  selected,
  workspace,
  unscheduledTasks,
  locale,
  t,
  router,
  setDraggingId,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  selected: CalendarItem | null;
  workspace: CalendarWorkspace;
  unscheduledTasks: CalendarWorkspace["unscheduledTasks"];
  locale: string;
  t: ReturnType<typeof useTranslations<"calendar">>;
  router: ReturnType<typeof useRouter>;
  setDraggingId: (id: string | null) => void;
  onClose: () => void;
  onEdit: (item: CalendarItem) => void;
  onDuplicate: (item: CalendarItem) => void;
  onDelete: (item: CalendarItem) => void;
}) {
  const canChange = selected && (selected.kind === "event" || selected.kind === "focus");
  const inspector = selected ? (
    <Inspector
      item={selected}
      locale={locale}
      timezone={workspace.preferences.timezone}
      t={t}
      onClose={onClose}
      onEdit={() => onEdit(selected)}
      onDuplicate={canChange && !selected.detailsHidden ? () => onDuplicate(selected) : undefined}
      onDelete={canChange && selected.editable ? () => onDelete(selected) : undefined}
    />
  ) : null;

  return (
    <>
      <aside
        className={cn(
          "min-w-0",
          selected
            ? "hidden lg:fixed lg:right-3 lg:bottom-3 lg:z-40 lg:block lg:max-h-[calc(100dvh-1.5rem)] lg:w-[22rem] lg:overflow-y-auto lg:drop-shadow-xl 2xl:static 2xl:w-auto 2xl:overflow-visible 2xl:drop-shadow-none"
            : "hidden 2xl:block",
        )}
      >
        {inspector ?? (
          <UnscheduledTray
            tasks={unscheduledTasks}
            t={t}
            onDragStart={(event, id) => {
              setDraggingId(`task:${id}`);
              dragPayload(event, { type: "task", id });
            }}
            onDragEnd={() => setDraggingId(null)}
            onSelect={(task) => router.push(canonicalTaskHref(task.id, task.projectId))}
          />
        )}
      </aside>
      <MobileBottomSheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={t("details")}
        description={selected?.title}
        closeLabel={t("close")}
      >
        {inspector}
      </MobileBottomSheet>
    </>
  );
}
