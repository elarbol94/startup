import { expect, test } from "@playwright/test";

test("recently opened can be added to the dashboard and reopens visited documents", async ({ page }) => {
  const credentials = { username: "admin", password: "super-secret-1" };
  let response = await page.request.post("/api/auth/sign-in/username", { data: credentials });
  if (!response.ok()) response = await page.request.post("/api/auth/sign-up/email", { data: { ...credentials, name: "E2E Admin", email: "admin@example.com" } });
  expect(response.ok()).toBe(true);
  await page.goto("/wiki");
  await page.getByRole("button", { name: "Dokument schreiben", exact: true }).click();
  await page.waitForURL(/\/wiki\/pages\/.+/);
  await expect(page.locator(".ProseMirror")).toBeVisible();
  const documentPath = new URL(page.url()).pathname;
  await page.goto("/");
  await page.getByRole("button", { name: "Layout anpassen", exact: true }).click();
  await page.getByRole("button", { name: "Hinzufügen", exact: true }).click();
  await page.getByRole("checkbox", { name: "Zuletzt geöffnet", exact: true }).check();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Fertig", exact: true }).click();
  const recent = page.getByRole("region", { name: "Zuletzt geöffnet", exact: true });
  await expect(recent.locator(`a[href="${documentPath}"]`)).toBeVisible();
  await page.reload();
  await expect(recent.locator(`a[href="${documentPath}"]`)).toBeVisible();
  await recent.locator(`a[href="${documentPath}"]`).click();
  await expect(page).toHaveURL(new RegExp(documentPath + "$"));
});
