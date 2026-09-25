"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { BookOpen, Plus } from "lucide-react";
import { createPage } from "@/modules/wiki/actions";
import { Button } from "@/components/ui/button";
import { useTextPrompt } from "@/components/ui/text-prompt-dialog";

export function WikiEmptyState() {
  const t = useTranslations("wiki");
  const common = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [textPrompt, askText] = useTextPrompt();

  async function onCreate() {
    const title = await askText({ title: t("newDocumentTitle"), description: t("newDocumentDescription"), label: t("pageTitle"), required: true, maxLength: 200, confirmLabel: common("create") });
    if (!title) return;
    const { slug } = await createPage({ title, parentId: null, proofingLanguage: locale === "en" ? "en-US" : "de-AT" });
    router.push(`/wiki/${slug}`);
    router.refresh();
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <BookOpen className="size-10 text-muted-foreground" />
      <p className="text-muted-foreground">{t("noPages")}</p>
      <Button onClick={onCreate}>
        <Plus className="size-4" />
        {t("createFirst")}
      </Button>
      {textPrompt}
    </div>
  );
}
