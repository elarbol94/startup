import { expect, test } from "@playwright/test";
import { loginAsAnyUser } from "./helpers/login";

test("offers a similar name in quick capture and merges the duplicate", async ({ page }) => {
  test.setTimeout(120_000);
  await loginAsAnyUser(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const prefix = `Merge${Date.now()}`;
  const original = `${prefix} Maria Huber`;
  const duplicate = `${prefix} Maria Hueber`;

  async function capture(name: string, expectSimilar: boolean) {
    await page.goto("/network");
    await page.getByTestId("network-quick-capture").click();
    const dialog = page.getByRole("dialog", { name: "Kontakt erfassen" });
    await dialog.getByLabel("Name").fill(name);
    if (expectSimilar) {
      // A near-miss is offered, but a new person stays the default.
      await expect(dialog.getByTestId("network-quick-similar")).toBeVisible();
      await expect(dialog.getByLabel("Hinzufügen zu")).toHaveValue("new");
    }
    await dialog.getByLabel("Was wurde gesagt?").fill(`Notiz zu ${name}`);
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toHaveCount(0);
  }
  await capture(original, false);
  await capture(duplicate, true);

  // Merge from the duplicate's page, keeping the original record.
  await page.goto("/network");
  await page.getByTestId("network-contact-list").getByRole("link", { name: new RegExp(duplicate) }).click();
  await expect(page.getByTestId("network-contact-name")).toHaveText(duplicate);
  await page.getByTestId("network-merge-open").click();
  const dialog = page.getByRole("dialog", { name: "Kontakte zusammenführen" });
  await dialog.getByLabel("Doppelter Kontakt").selectOption({ label: original });
  await dialog.getByRole("button", { name: "Richtung tauschen" }).click();
  const preview = dialog.getByTestId("network-merge-preview");
  await expect(preview).toContainText("Bleibt erhalten");
  await expect(preview).toContainText("1 Möglichkeit");
  await dialog.getByRole("button", { name: "Endgültig zusammenführen" }).click();

  await expect(page.getByTestId("network-contact-name")).toHaveText(original);
  const detail = page.getByTestId("network-contact-detail");
  await expect(detail).toContainText(`Zusammengeführt aus ${duplicate}`);
  await expect(detail).toContainText(`Notiz zu ${original}`);
  await expect(detail).toContainText(`Notiz zu ${duplicate}`);
  await page.goto("/network");
  await expect(page.getByTestId("network-contact-list").getByRole("link", { name: new RegExp(duplicate) })).toHaveCount(0);

  expect(errors).toEqual([]);
});
