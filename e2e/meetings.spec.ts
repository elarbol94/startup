import { expect, test } from "@playwright/test";
import { loginAsAnyUser } from "./helpers/login";

// Media processing needs ffmpeg and OpenAI, so this covers what works without
// them: the meeting, consent-gated upload, a manual protocol, approval and
// turning an action item into exactly one task.
test("records a meeting protocol by hand and turns an action item into a task", async ({ page }) => {
  test.setTimeout(180_000);
  await loginAsAnyUser(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const title = `Jour fixe ${Date.now()}`;

  await page.goto("/");
  await page.getByTestId("app-sidebar").locator('[data-navigation-key="meetings"]').press("Enter");
  await expect(page).toHaveURL(/\/meetings$/);
  await expect(page.getByRole("heading", { name: "Besprechungen" })).toBeVisible();

  await page.getByRole("button", { name: "Neue Besprechung" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Neue Besprechung" });
  await dialog.getByLabel("Titel").fill(title);
  await dialog.getByLabel("Tagesordnung").fill("Förderantrag");
  await dialog.getByRole("button", { name: "Anlegen" }).click();
  await expect(page).toHaveURL(/\/meetings\/[^/]+$/);
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // Upload stays disabled until the consent declarations are confirmed.
  await page.getByRole("tab", { name: "Aufnahmen" }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "e2e.mp3", mimeType: "audio/mpeg", buffer: Buffer.concat([Buffer.from("ID3"), Buffer.alloc(4096, 1)]),
  });
  const uploadButton = page.getByRole("button", { name: "Hochladen" });
  await expect(uploadButton).toBeDisabled();
  await page.getByText("Alle aufgenommenen Personen wurden über die Aufnahme informiert").click();
  await expect(uploadButton).toBeDisabled();
  await page.getByText("Sie sind auch einverstanden").click();
  await uploadButton.click();
  await expect(page.getByText("e2e.mp3")).toBeVisible({ timeout: 60_000 });

  // A protocol written by hand, approved by the host.
  await page.getByRole("tab", { name: "Protokoll" }).click();
  await page.getByRole("button", { name: "Protokoll selbst schreiben" }).click();
  await page.getByLabel("Zusammenfassung", { exact: true }).fill("Antrag wird diese Woche eingereicht.");
  const actionItems = page.locator("fieldset").filter({ hasText: "Aufgaben" });
  await actionItems.getByRole("button", { name: "Hinzufügen" }).click();
  await actionItems.getByRole("textbox", { name: "Aufgaben" }).fill("Antrag an das Land schicken");
  await page.getByRole("button", { name: "Als neue Version speichern" }).click();
  await expect(page.getByText("Entwurf", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Freigeben" }).click();
  await expect(page.getByText("Freigegeben", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Als Aufgabe übernehmen" }).click();
  const accept = page.getByRole("dialog", { name: "Aufgabe anlegen" });
  await expect(accept.getByLabel("Titel der Aufgabe")).toHaveValue("Antrag an das Land schicken");
  await accept.getByRole("button", { name: "Aufgabe anlegen" }).click();
  await expect(page.getByText("Aufgabe: Antrag an das Land schicken")).toBeVisible();
  await expect(page.getByRole("button", { name: "Als Aufgabe übernehmen" })).toHaveCount(0);

  // The protocol is searchable from the list.
  await page.goto("/meetings?q=eingereicht");
  await expect(page.getByRole("link", { name: new RegExp(title) }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
