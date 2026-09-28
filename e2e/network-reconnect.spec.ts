import { expect, test } from "@playwright/test";
import { loginAsAnyUser } from "./helpers/login";

test("sets a keep-in-touch cadence and clears the reminder by marking contacted", async ({ page }) => {
  test.setTimeout(120_000);
  await loginAsAnyUser(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const name = `Reconnect${Date.now()} Rosa`;

  await page.goto("/network");
  await page.getByTestId("network-quick-capture").click();
  const capture = page.getByRole("dialog", { name: "Kontakt erfassen" });
  await capture.getByLabel("Name").fill(name);
  // "Met today" is on by default; a contact we have not spoken to has no last-contact date.
  await capture.getByRole("checkbox", { name: "Noch nicht gesprochen (nur davon gehört)" }).click();
  await capture.getByRole("button", { name: "Speichern" }).click();
  await expect(capture).toHaveCount(0);
  await page.getByTestId("network-contact-list").getByRole("link", { name: new RegExp(name) }).click();
  await expect(page.getByTestId("network-contact-name").filter({ visible: true })).toHaveText(name);

  // Choose a cadence in the edit dialog; without any contact yet it is due at once.
  await page.getByTestId("network-contact-detail").filter({ visible: true }).getByRole("button", { name: "Bearbeiten", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Kontakt bearbeiten" });
  await edit.getByLabel("In Kontakt bleiben").selectOption("30");
  await edit.getByRole("button", { name: "Speichern" }).click();
  await expect(edit).toHaveCount(0);
  const detail = page.getByTestId("network-contact-detail").filter({ visible: true });
  await expect(detail.getByText("Alle 30 Tage · Noch kein Kontakt")).toBeVisible();

  // The list can be sorted by who is due.
  await page.goto("/network?sort=reconnect");
  await expect(page.getByLabel("Sortierung")).toHaveValue("reconnect");
  const row = page.getByTestId("network-contact-list").getByRole("link", { name: new RegExp(`^${name}`) });
  await expect(row.getByTestId("network-reconnect-label")).toHaveText("Noch kein Kontakt");

  // It shows up under "Wieder melden" until marked as contacted.
  await page.goto("/network/opportunities");
  const reconnect = page.getByTestId("network-reconnect");
  await expect(reconnect.getByRole("link", { name })).toBeVisible();
  await reconnect.getByRole("button", { name: `Heute mit ${name} gesprochen` }).click();
  await expect(page.getByText("Heutiges Gespräch eingetragen")).toBeVisible();
  await expect(page.getByRole("link", { name, exact: true })).toHaveCount(0);

  // Clearing the cadence removes the reminder from the contact.
  await page.goto("/network");
  await page.getByTestId("network-contact-list").getByRole("link", { name: new RegExp(name) }).click();
  await expect(detail.getByText(/Alle 30 Tage · Nächstes Mal am/)).toBeVisible();
  await page.getByTestId("network-contact-detail").filter({ visible: true }).getByRole("button", { name: "Bearbeiten", exact: true }).click();
  await edit.getByLabel("In Kontakt bleiben").selectOption("");
  await edit.getByRole("button", { name: "Speichern" }).click();
  await expect(edit).toHaveCount(0);
  await expect(detail.getByText(/Alle 30 Tage/)).toHaveCount(0);

  expect(errors).toEqual([]);
});
