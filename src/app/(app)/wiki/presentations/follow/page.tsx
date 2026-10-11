import { getTranslations } from "next-intl/server";
import { RadioTower } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PresentationJoinForm } from "@/modules/wiki/components/presentation-live";
import { WIKI_PAGE_CLASS } from "@/modules/wiki/components/wiki-page-class";

export default async function FollowPresentationPage() {
  const [, t] = await Promise.all([requireUser(), getTranslations("wiki")]);
  return (
    <div className={WIKI_PAGE_CLASS}>
      <div className="mx-auto max-w-md rounded-xl border bg-card px-6 py-8 text-center shadow-card">
        <span aria-hidden className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-brand-soft text-brand-ink"><RadioTower className="size-[18px]" /></span>
        <h1 className="text-[14.5px] font-semibold">{t("presentations.joinLive")}</h1>
        <p className="mt-1 mb-4 text-[13.5px] text-muted-foreground">{t("presentations.joinLiveDescription")}</p>
        <div className="flex justify-center">
          <PresentationJoinForm />
        </div>
      </div>
    </div>
  );
}
