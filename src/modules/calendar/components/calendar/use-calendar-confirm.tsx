"use client";

// Promise-based confirmation for calendar flows (deleting, moving schedules, saving over conflicts).
// Wraps the app's ConfirmDialog; render the returned element once in the owning component.
import { type ReactNode } from "react";
import { useConfirm, type ConfirmOptions } from "@/components/ui/confirm-dialog";

export type CalendarConfirmOptions = ConfirmOptions;
export type CalendarConfirm = (options: CalendarConfirmOptions) => Promise<boolean>;

/**
 * `const [confirmDialog, confirm] = useCalendarConfirm()`; render `confirmDialog`,
 * then `if (await confirm({ title, description, confirmLabel, destructive })) …`.
 * Dismissing the dialog resolves to false.
 */
export function useCalendarConfirm(): [ReactNode, CalendarConfirm] {
  return useConfirm();
}
