import { expect, test } from "@playwright/test";
import { loginAsAnyUser } from "./helpers/login";

// Tasks, deadlines and projects are opt-in, and toggling a calendar off and on again returns
// to the unfiltered default instead of silently changing which work items are shown.
test("calendar filters start with calendar entries only and reset when re-selected", async ({ page }) => {
  await loginAsAnyUser(page);
  await page.goto("/calendar?date=2026-07-29&view=month");
  await page.getByRole("button", { name: "Filter" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Personen & Terminarten").click();
  await expect(dialog.getByRole("checkbox", { name: "Termine" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "Aufgaben & Meilensteine" })).not.toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "Projekte" })).not.toBeChecked();

  await dialog.getByRole("checkbox", { name: "Aufgaben & Meilensteine" }).dispatchEvent("click");
  await expect(page).toHaveURL(/sources=event(%2C|,)focus(%2C|,)task/);
  await dialog.getByRole("checkbox", { name: "Aufgaben & Meilensteine" }).dispatchEvent("click");
  await expect(page).not.toHaveURL(/sources=/);

  const calendar = dialog.getByRole("checkbox").first();
  await calendar.dispatchEvent("click");
  await expect(page).toHaveURL(/calendars=/);
  await calendar.dispatchEvent("click");
  await expect(page).not.toHaveURL(/calendars=/);
});
