import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  getFundingProjectControl,
  listFundingProgramTemplates,
} from "@/modules/funding/queries";
import { FundingProjectControlView } from "@/modules/funding/components/funding-project-control";
import { NetworkContactsPanel } from "@/modules/network/components/network-contacts-panel";
import { listLinkedNetworkContacts } from "@/modules/network/link-queries";
import { listNetworkContactOptions } from "@/modules/network/queries";

export default async function FundingProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const viewer = await requireUser();
  const { projectId } = await params;
  const control = getFundingProjectControl(projectId);
  if (!control) notFound();
  const templates = listFundingProgramTemplates();
  return (
    <FundingProjectControlView
      control={control}
      templates={templates}
      networkContacts={
        <NetworkContactsPanel
          targetType="fundingProject"
          targetId={projectId}
          contacts={listLinkedNetworkContacts(viewer, "fundingProject", projectId)}
          options={listNetworkContactOptions(viewer)}
        />
      }
    />
  );
}
