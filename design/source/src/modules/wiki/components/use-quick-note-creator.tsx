"use client";

import { useCallback, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useTextPrompt } from "@/components/ui/text-prompt-dialog";
import { requestAppNavigation } from "@/lib/app-navigation";
import { createOfficeDocument } from "../office/office-actions";

/**
 * Asks for a title first and only then creates the (Word) document, so
 * cancelling leaves nothing behind. Render `dialog` once wherever the hook is used.
 */
export function useQuickNoteCreator({ onCreated }: { onCreated?: () => void } = {}) {
  const t = useTranslations("wiki");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [dialog, askText] = useTextPrompt();
  const [creating, setCreating] = useState(false);
  const busy = useRef(false);

  const create = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const title = await askText({ title: t("newDocumentTitle"), description: t("newDocumentDescription"), label: t("pageTitle"), required: true, maxLength: 200, confirmLabel: common("create") });
      if (!title) return;
      requestAppNavigation("/wiki/pages", async () => {
        setCreating(true);
        try {
          const note = await createOfficeDocument({ title, parentId: null, locale: locale === "en" ? "en" : "de" });
          onCreated?.();
          router.push(`/wiki/pages/${note.slug}`);
        } catch {
          toast.error(t("quickNoteFailed"));
        } finally {
          setCreating(false);
        }
      });
    } finally {
      busy.current = false;
    }
  }, [askText, common, locale, onCreated, router, t]);

  return { dialog, create, creating };
}
