"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { TimeActionResult } from "../../action-helpers";

/** Runs a time server action, maps error codes to messages and refreshes the page. */
export function useTimeAction() {
  const t = useTranslations("time");
  const common = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run<T extends object>(
    action: () => Promise<TimeActionResult<T>>,
    onSuccess?: (result: { ok: true } & T) => void,
  ) {
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
