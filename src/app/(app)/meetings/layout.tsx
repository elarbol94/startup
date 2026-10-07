import { getTranslations } from "next-intl/server";
import { Video } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";

export default async function MeetingsLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const t = await getTranslations("meetings");
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <PageHeader className="mb-0" icon={<Video />} title={t("title")} description={t("description")} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
