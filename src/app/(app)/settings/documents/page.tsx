import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listConversionCandidates } from "@/modules/wiki/office/queries";
import { DocumentConversionList } from "@/modules/wiki/components/office/document-conversion-list";

export default async function DocumentConversionPage() {
  if ((await requireUser()).role !== "admin") redirect("/settings/profile");
  const t = await getTranslations("settings.documents");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <DocumentConversionList documents={listConversionCandidates()} />
      </CardContent>
    </Card>
  );
}
