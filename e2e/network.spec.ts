import { expect, test } from "@playwright/test";
import { loginAsAnyUser } from "./helpers/login";

test("captures a contact, follows up an opportunity and deletes the contact", async ({ page }) => {
  test.setTimeout(180_000);
  await loginAsAnyUser(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const name = `Sebastian ${Date.now()}`;

  // Reached from the main navigation.
  await page.goto("/");
  await page.getByTestId("app-sidebar").locator('[data-navigation-key="network"]').press("Enter");
  await expect(page).toHaveURL(/\/network$/);
  await expect(page.getByRole("heading", { name: "Netzwerk" })).toBeVisible();

  // Quick capture of a new, private contact.
  await page.getByTestId("network-quick-capture").click();
  let dialog = page.getByRole("dialog", { name: "Kontakt erfassen" });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Was wurde gesagt?").fill("Kennt jemanden beim Klimabündnis Österreich");
  await dialog.getByRole("button", { name: "Intro möglich" }).click();
  await dialog.getByLabel("Kennengelernt bei").fill("Party");
  await dialog.getByLabel("Tags").fill("Nachhaltigkeit, Gemeinden");
  await expect(dialog.getByText("Neue Kontakte sind privat")).toBeVisible();
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toHaveCount(0);
  const row = page.getByTestId("network-contact-list").getByRole("link", { name: new RegExp(name) });
  await expect(row).toContainText("Intro möglich: Kennt jemanden beim Klimabündnis Österreich");

  // Typing the same name again offers the existing contact instead of a duplicate.
  await page.getByTestId("network-quick-capture").click();
  dialog = page.getByRole("dialog", { name: "Kontakt erfassen" });
  await dialog.getByLabel("Name").fill(name.toLowerCase());
  await expect(dialog.getByLabel("Hinzufügen zu")).toHaveValue(/.+/);
  await expect(dialog.getByLabel("Kennengelernt bei")).toHaveCount(0);
  await dialog.getByLabel("Was wurde gesagt?").fill("Hilft bei Förderanträgen");
  await dialog.getByRole("button", { name: "Kann unterstützen" }).click();
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId("network-contact-list").getByRole("link", { name: new RegExp(name) })).toHaveCount(1);

  // Accent-insensitive search and tag filter.
  await page.getByRole("searchbox").fill("klimabundnis");
  await page.getByRole("search").getByRole("button", { name: "Suchen" }).click();
  await expect(row).toBeVisible();

  // Opportunities checklist: mark one as asked and tick the other off.
  await page.getByRole("link", { name: "Offene Möglichkeiten" }).click();
  const leads = page.getByTestId("network-lead-list");
  const intro = leads.getByRole("listitem").filter({ hasText: "Klimabündnis" });
  const help = leads.getByRole("listitem").filter({ hasText: "Förderanträgen" });
  await intro.getByRole("button", { name: "Angefragt" }).click();
  await expect(intro).toContainText("Angefragt, wartet");
  await help.getByRole("checkbox").click();
  await expect(help).toHaveCount(0);

  // Detail page: tags, last contact, sharing.
  await intro.getByRole("link", { name }).click();
  await expect(page.getByTestId("network-contact-name")).toHaveText(name);
  await expect(page.getByText("Nur du siehst diesen Kontakt.")).toBeVisible();
  await expect(page.getByText("Nachhaltigkeit", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Heute gesprochen" }).click();
  await expect(page.getByRole("button", { name: "Heute gesprochen" })).toBeDisabled();
  await page.getByRole("button", { name: "Mit Team teilen" }).click();
  await expect(page.getByText("Das ganze Team kann diesen Kontakt sehen")).toBeVisible();

  // Delete needs a second click.
  await page.getByRole("button", { name: "Kontakt löschen" }).click();
  await page.getByRole("button", { name: "Zum endgültigen Löschen erneut klicken" }).click();
  await expect(page).toHaveURL(/\/network$/);
  await expect(page.getByTestId("network-contact-list").getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
  expect(errors).toEqual([]);
});
