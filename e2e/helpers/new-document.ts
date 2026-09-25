import { expect, type Page } from "@playwright/test";

/** New documents ask for their title before anything is created. */
export async function submitNewDocumentTitle(page: Page, title: string) {
  const dialog = page.getByRole("dialog", { name: "Neues Dokument" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Titel", { exact: true }).fill(title);
  await dialog.getByRole("button", { name: "Erstellen", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
