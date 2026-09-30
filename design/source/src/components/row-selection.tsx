"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useRowSelection, type RowSelection } from "@/lib/use-row-selection";

const RowSelectionContext = createContext<RowSelection | null>(null);

/** Lets server-rendered rows host selection checkboxes: the provider owns the state. */
export function RowSelectionProvider({ ids, children }: { ids: readonly string[]; children: ReactNode }) {
  const selection = useRowSelection(ids);
  return <RowSelectionContext.Provider value={selection}>{children}</RowSelectionContext.Provider>;
}

export function RowSelectionContextProvider({ selection, children }: { selection: RowSelection; children: ReactNode }) {
  return <RowSelectionContext.Provider value={selection}>{children}</RowSelectionContext.Provider>;
}

export function useRowSelectionContext(): RowSelection {
  const selection = useContext(RowSelectionContext);
  if (!selection) throw new Error("useRowSelectionContext needs a RowSelectionProvider");
  return selection;
}

/**
 * Row checkbox. Clicks never reach the row (a link, or a drag handle), and
 * Shift+click selects the range from the previously clicked row.
 */
export function RowSelectCheckbox({ id, label, selection, className }: { id: string; label: string; selection?: RowSelection; className?: string }) {
  const t = useTranslations("common.selection");
  const fromContext = useContext(RowSelectionContext);
  const current = selection ?? fromContext;
  if (!current) return null;
  return (
    <Checkbox
      checked={current.isSelected(id)}
      aria-label={t("selectRow", { name: label })}
      data-testid="row-select"
      className={className}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        current.toggle(id, { shift: event.shiftKey });
      }}
      onPointerDown={(event) => event.stopPropagation()}
    />
  );
}

export function SelectAllCheckbox({ selection, className }: { selection?: RowSelection; className?: string }) {
  const t = useTranslations("common.selection");
  const fromContext = useContext(RowSelectionContext);
  const current = selection ?? fromContext;
  if (!current || current.visibleIds.length === 0) return null;
  return (
    <Checkbox
      checked={current.header === "all"}
      indeterminate={current.header === "some"}
      aria-label={t("selectAll")}
      data-testid="select-all"
      className={cn(className)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        current.toggleAll();
      }}
    />
  );
}
