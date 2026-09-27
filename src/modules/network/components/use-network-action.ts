"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { NetworkActionResult } from "../action-helpers";

/** Runs a network server action, maps error codes to messages and refreshes the page. */
export function useNetworkAction() {
  const t = useTranslations("network");
  const common = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run<T extends object>(
    action: () => Promise<NetworkActionResult<T>>,
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
