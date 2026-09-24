import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { SettingsTabs } from "./settings-tabs";

export const instant = false;

async function SettingsChrome({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();
  const t = await getTranslations("settings");

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <PageHeader className="mb-0" title={t("title")} />
      <SettingsTabs isAdmin={user.role === "admin"} />
      <div className="w-full max-w-5xl">{children}</div>
    </div>
  );
}

export default function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<div className="min-h-48" />}>
      <SettingsChrome>{children}</SettingsChrome>
    </Suspense>
  );
}
