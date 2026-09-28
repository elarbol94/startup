import { expect, test } from "@playwright/test";
import { loginAsAnyUser } from "./helpers/login";

test("marks a new contact as not spoken yet and clears it once contacted", async ({ page }) => {
  test.setTimeout(120_000);
  await loginAsAnyUser(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const name = `NotSpoken${Date.now()} Lena`;

  // Quick capture: "not spoken yet" and "talked today" exclude each other.
  await page.goto("/network");
  await page.getByTestId("network-quick-capture").click();
  const capture = page.getByRole("dialog", { name: "Kontakt erfassen" });
  await capture.getByLabel("Name").fill(name);
  const metToday = capture.getByRole("checkbox", { name: "Heute gesprochen" });
  const notSpoken = capture.getByRole("checkbox", { name: /Noch nicht gesprochen/ });
  await expect(metToday).toBeChecked();
  await notSpoken.click();
  await expect(notSpoken).toBeChecked();
  await expect(metToday).not.toBeChecked();
  await capture.getByRole("button", { name: "Speichern" }).click();
  await expect(capture).toHaveCount(0);

  // The list filter and the badge.
  await page.goto("/network?spoken=no");
  await expect(page.getByLabel("Gesprochen", { exact: true })).toHaveValue("no");
  const row = page.getByTestId("network-contact-list").getByRole("link", { name: new RegExp(name) });
  await expect(row.getByTestId("network-not-spoken-badge")).toBeVisible();
  await row.click();
  await expect(page.getByTestId("network-contact-name").filter({ visible: true })).toHaveText(name);
  const detail = page.getByTestId("network-contact-detail").filter({ visible: true });
  await expect(detail.getByTestId("network-not-spoken-badge")).toBeVisible();

  // Marking the contact as contacted clears the flag.
  await page.getByRole("button", { name: "Heute gesprochen" }).click();
  await expect(page.getByText("Heutiges Gespräch eingetragen")).toBeVisible();
  await expect(detail.getByTestId("network-not-spoken-badge")).toHaveCount(0);
  await page.goto("/network?spoken=no");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);

  // It can be set again by hand in the edit dialog.
  await page.goto("/network");
  await page.getByTestId("network-contact-list").getByRole("link", { name: new RegExp(name) }).click();
  await page.getByTestId("network-contact-detail").filter({ visible: true }).getByRole("button", { name: "Bearbeiten", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Kontakt bearbeiten" });
  await edit.getByRole("checkbox", { name: "Noch nicht gesprochen" }).click();
  await edit.getByRole("button", { name: "Speichern" }).click();
  await expect(edit).toHaveCount(0);
  await expect(detail.getByTestId("network-not-spoken-badge")).toBeVisible();

  expect(errors).toEqual([]);
});
