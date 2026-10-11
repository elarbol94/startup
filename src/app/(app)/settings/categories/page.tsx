import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listCategories } from "@/modules/accounting/queries";
import { SettingsCard } from "../settings-card";
import { CategoriesManager } from "./categories-manager";

export default async function CategoriesSettingsPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/settings/profile");

  const categories = listCategories({ includeArchived: true });
  const t = await getTranslations("settings.categories");

  return (
    <SettingsCard title={t("title")} description={t("description")}>
      <CategoriesManager categories={categories} />
    </SettingsCard>
  );
}
