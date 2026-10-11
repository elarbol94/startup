import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FolderX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default async function ProjectNotFound() {
  const t = await getTranslations("projects");
  return (
    <div className="mx-auto max-w-4xl p-5 md:p-8">
      <div className="grid min-h-72 place-items-center rounded-xl border bg-card shadow-card">
        <EmptyState
          icon={<FolderX />}
          title={<span role="heading" aria-level={1}>{t("projectNotFound")}</span>}
          description={t("projectNotFoundDescription")}
          actions={
            <Button nativeButton={false} render={<Link href="/projects" />}>
              {t("backToProjects")}
            </Button>
          }
        />
      </div>
    </div>
  );
}
