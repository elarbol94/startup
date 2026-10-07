"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { MeetingActionResult } from "../action-helpers";

export const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

/** 3723000 → "1:02:03" */
export function formatClock(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const rest = `${String(Math.floor(seconds / 60) % 60).padStart(hours ? 2 : 1, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return hours ? `${hours}:${rest}` : rest;
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Runs a meetings server action, shows its error and refreshes the page. */
export function useMeetingAction() {
  const t = useTranslations("meetings");
  const common = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run<T extends object>(action: () => Promise<MeetingActionResult<T>>, onSuccess?: (result: { ok: true } & T) => void) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(t(`errors.${result.error}`));
          return;
        }
        onSuccess?.(result);
        router.refresh();
      } catch {
        toast.error(common("error"));
      }
    });
  }

  return { pending, run };
}
