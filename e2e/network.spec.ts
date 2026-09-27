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
  // Earlier routes stay mounted (hidden), so everything below is scoped to the contact page.
  const detail = page.getByTestId("network-contact-detail");
  await expect(detail.getByTestId("network-contact-name")).toHaveText(name);
  await expect(detail.getByText("Nur du siehst diesen Kontakt.")).toBeVisible();
  await expect(detail.getByText("Nachhaltigkeit", { exact: true })).toBeVisible();
  // Quick capture logged today's conversation, so "spoke today" is already done.
  await expect(detail.getByRole("button", { name: "Heute gesprochen" })).toBeDisabled();
  const history = detail.getByTestId("network-interactions");
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await detail.getByLabel("Art", { exact: true }).selectOption({ label: "Telefonat" });
  await detail.getByLabel("Notiz", { exact: true }).fill("Wegen Intro nachgefragt");
  await detail.getByRole("button", { name: "Eintragen" }).click();
  await expect(history.getByRole("listitem")).toHaveCount(2);
  await expect(history).toContainText("Telefonat: Wegen Intro nachgefragt");

  // Turn the intro's next step into a regular task, linked back to the lead.
  const contactUrl = page.url();
  const leadRow = detail.getByTestId("network-lead-list").getByRole("listitem").filter({ hasText: "Klimabündnis" });
  await leadRow.getByRole("button", { name: "Aufgabe erstellen" }).click();
  const taskDialog = page.getByRole("dialog", { name: "Aufgabe erstellen" });
  await expect(taskDialog.getByRole("textbox").first()).toHaveValue("Kennt jemanden beim Klimabündnis Österreich");
  await taskDialog.getByRole("button", { name: "Aufgabe erstellen" }).click();
  await expect(taskDialog).toHaveCount(0);
  await expect(leadRow.getByRole("link", { name: "Aufgabe offen" })).toBeVisible();

  // The dashboard can show open follow-ups.
  await page.goto("/");
  await page.getByRole("button", { name: "Layout anpassen" }).click();
  await page.getByRole("button", { name: "Hinzufügen" }).click();
  await page.getByRole("checkbox", { name: "Netzwerk · Nachfassen" }).check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fertig" }).click();
  await expect(page.getByTestId("overview-network")).toContainText(name);
  await page.goto(contactUrl);
  await detail.getByRole("button", { name: "Mit Team teilen" }).click();
  await expect(detail.getByText("Das ganze Team kann diesen Kontakt sehen")).toBeVisible();

  // Delete needs a second click.
  await detail.getByRole("button", { name: "Kontakt löschen" }).click();
  await detail.getByRole("button", { name: "Zum endgültigen Löschen erneut klicken" }).click();
  await expect(page).toHaveURL(/\/network$/);
  await expect(page.getByTestId("network-contact-list").getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
  expect(errors).toEqual([]);
});
