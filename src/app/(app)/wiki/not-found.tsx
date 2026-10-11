import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FileQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WIKI_PAGE_CLASS } from "@/modules/wiki/components/wiki-page-class";

export default async function WikiNotFound() {
  const t = await getTranslations("wiki");
  return <div className={WIKI_PAGE_CLASS}>
    <div className="flex flex-col items-center gap-1.5 rounded-xl border bg-card px-6 py-10 text-center shadow-card">
      <span aria-hidden className="mb-1.5 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-ink"><FileQuestion className="size-[18px]" /></span>
      <h1 className="text-[14.5px] font-semibold">{t("notFoundTitle")}</h1>
      <p className="max-w-[360px] text-[13.5px] text-pretty text-muted-foreground">{t("notFoundDescription")}</p>
      <div className="mt-2.5 flex justify-center">
        <Button render={<Link href="/wiki" />}>{t("backToWikiStart")}</Button>
      </div>
    </div>
  </div>;
}
