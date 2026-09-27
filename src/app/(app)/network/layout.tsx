import { getTranslations } from "next-intl/server";
import { Handshake } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { NetworkSubnav } from "@/modules/network/components/network-subnav";
import { QuickCaptureButton } from "@/modules/network/components/contact-capture-provider";

export default async function NetworkLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const t = await getTranslations("network");
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <PageHeader
        className="mb-0"
        icon={<Handshake />}
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <NetworkSubnav />
            <QuickCaptureButton />
          </>
        }
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
