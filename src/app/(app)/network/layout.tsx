import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { NetworkSubnav } from "@/modules/network/components/network-subnav";
import { QuickCaptureButton } from "@/modules/network/components/contact-capture-provider";

export default async function NetworkLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const t = await getTranslations("network");
  const tNav = await getTranslations("nav");
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <PageHeader
        className="mb-0"
        eyebrow={tNav("groups.knowledge")}
        title={t("title")}
        description={t("description")}
        actions={<QuickCaptureButton />}
      />
      <NetworkSubnav />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
