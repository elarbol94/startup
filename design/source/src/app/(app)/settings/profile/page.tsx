import { requireUser } from "@/lib/auth";
import {
  getMyProfilePreferences,
  listMarkColorAvailability,
} from "@/modules/settings/queries";
import { AccountForm } from "./account-form";
import { AppearanceForm } from "./appearance-form";
import { MarkColorForm } from "./mark-color-form";

export default async function ProfileSettingsPage() {
  const currentUser = await requireUser();
  const preferences = getMyProfilePreferences(currentUser.id);
  const availability = listMarkColorAvailability(currentUser.id);

  return (
    <div className="flex flex-col gap-6">
      <AccountForm userId={currentUser.id} name={currentUser.name} email={currentUser.email} />
      <AppearanceForm />
      <MarkColorForm
        userId={currentUser.id}
        name={currentUser.name}
        currentColor={preferences.markColor}
        availability={availability}
      />
    </div>
  );
}
