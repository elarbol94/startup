import { ExternalLink } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { nextcloudUrl } from "@/modules/cloud/config";

export default async function CloudPage() {
  await requireUser();
  const t = await getTranslations("cloud");
  const url = nextcloudUrl();
  return (
    <div className="flex h-full min-h-[32rem] flex-col gap-3">
      <PageHeader
        className="mb-0"
        title={t("title")}
        description={t("description")}
        actions={
          <a className={buttonVariants({ variant: "outline" })} href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink data-icon="inline-start" />
            {t("openInNewTab")}
          </a>
        }
      />
      {/* Nextcloud must allow this origin in its frame-ancestors policy; otherwise the
          browser shows a blocked frame and the button above is the way in. */}
      <iframe
        src={url}
        title={t("frameTitle")}
        className="min-h-0 w-full flex-1 rounded-xl border bg-card shadow-card"
        allow="clipboard-read; clipboard-write; fullscreen; camera; microphone; display-capture"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
