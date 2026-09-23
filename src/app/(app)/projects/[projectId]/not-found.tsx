import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FolderX } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function ProjectNotFound() {
  const t = await getTranslations("projects");
  return (
    <div className="mx-auto max-w-4xl p-5 md:p-8">
      <div className="grid min-h-72 place-items-center rounded-xl border border-dashed bg-muted/20 text-center">
        <div>
          <FolderX className="mx-auto mb-3 size-8 text-muted-foreground" />
          <h1 className="font-medium">{t("projectNotFound")}</h1>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {t("projectNotFoundDescription")}
          </p>
          <div className="mt-4 flex justify-center">
            <Button nativeButton={false} render={<Link href="/projects" />}>
              {t("backToProjects")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
