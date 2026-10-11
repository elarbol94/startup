import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { SettingsCard } from "../settings-card";
import { listConversionCandidates } from "@/modules/wiki/office/queries";
import { DocumentConversionList } from "@/modules/wiki/components/office/document-conversion-list";

export default async function DocumentConversionPage() {
  if ((await requireUser()).role !== "admin") redirect("/settings/profile");
  const t = await getTranslations("settings.documents");
  return (
    <SettingsCard title={t("title")} description={t("description")}>
      <DocumentConversionList documents={listConversionCandidates()} />
    </SettingsCard>
  );
}
