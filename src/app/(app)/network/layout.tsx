import { getTranslations } from "next-intl/server";
import { Handshake } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { NetworkSubnav } from "@/modules/network/components/network-subnav";
import { QuickCaptureDialog } from "@/modules/network/components/quick-capture-dialog";
import { listNetworkContactOptions, listNetworkMetContextSuggestions, listNetworkTagSuggestions } from "@/modules/network/queries";

export default async function NetworkLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireUser();
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
            <QuickCaptureDialog
              contacts={listNetworkContactOptions(viewer)}
              tags={listNetworkTagSuggestions(viewer)}
              metContexts={listNetworkMetContextSuggestions(viewer)}
            />
          </>
        }
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
