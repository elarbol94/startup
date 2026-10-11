import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { listAllBusinessLocations } from "@/modules/settings/queries";
import { SettingsCard } from "../settings-card";
import { LocationsManager } from "./locations-manager";

export default async function LocationsSettingsPage() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/settings/profile");
  const t = await getTranslations("settings.locations");
  return (
    <SettingsCard title={t("title")} description={t("description")}>
      <LocationsManager locations={listAllBusinessLocations()} />
    </SettingsCard>
  );
}
