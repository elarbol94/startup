import { expect, test } from "@playwright/test";
import { loginAsAnyUser } from "./helpers/login";

// The sync itself is covered by src/modules/calendar/caldav-*.test.ts; this checks the
// entry point renders without contacting Nextcloud before a login is entered.
test("opens the Nextcloud sync dialog with the app-password login", async ({ page }) => {
  await loginAsAnyUser(page);
  await page.goto("/calendar?date=2026-07-29&view=week");
  await page.getByRole("button", { name: "Filter" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Kalender hinzufügen" }).click();
  await page.getByRole("menuitem", { name: "Mit Nextcloud synchronisieren…" }).click();

  const dialog = page.getByRole("dialog", { name: "Mit Nextcloud synchronisieren" });
  await expect(dialog.getByText("App-Passwort", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Nextcloud-Anmeldename" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Verbinden" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Abbrechen" }).click();
  await expect(dialog).toBeHidden();
});
