import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 1000 }, actionTimeout: 30_000, navigationTimeout: 60_000 });
test.setTimeout(180_000);

test("presentation keeps failed edits open when switching application sections", async ({ page }) => {
  const credentials = { username: "admin", password: "super-secret-1" };
  let login = await page.request.post("/api/auth/sign-in/username", { data: credentials });
  if (!login.ok()) login = await page.request.post("/api/auth/sign-up/email", { data: { ...credentials, name: "E2E Admin", email: "admin@example.com" } });
  expect(login.ok()).toBe(true);
  await page.goto("/wiki/presentations");
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Leer oder aus Vorlage", exact: true }).click();
  await page.getByRole("textbox", { name: "Titel der Präsentation" }).fill(`Navigation ${Date.now()}`);
  await page.getByRole("dialog").getByRole("button", { name: "Vorlage verwenden", exact: true }).click();
  await page.waitForURL(/\/wiki\/presentations\/[^/]+$/);
  await expect(page.getByRole("button", { name: "Text", exact: true })).toBeEnabled();
  const editorUrl = page.url();
  const endpoint = "**/api/wiki/collaboration/presentation/*";
  let attempts = 0;
  await page.route(endpoint, async route => {
    if (route.request().method() === "POST" && route.request().postDataJSON()?.update) {
      attempts++;
      await route.fulfill({ status: 503, body: "Temporarily unavailable" });
    } else await route.continue();
  });
  const draft = `Keep this unsaved presentation ${Date.now()}`;
  await page.getByRole("textbox", { name: "Titel der Präsentation" }).fill(draft);
  await page.getByTestId("app-sidebar").getByRole("button", { name: "Projekte", exact: true }).press("Enter");
  await expect.poll(() => attempts).toBeGreaterThan(0);
  await expect(page).toHaveURL(editorUrl);
  await expect(page.getByText("Deine Änderungen konnten nicht gespeichert werden. Bitte behebe das Speicherproblem vor dem Verlassen.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(editorUrl);
  // Recover and retry the same navigation. The latest edit must survive reopening.
  await page.unroute(endpoint);
  await page.getByTestId("app-sidebar").getByRole("button", { name: "Projekte", exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/projects$/);
  await page.goto(editorUrl);
  await expect(page.getByRole("textbox", { name: "Titel der Präsentation" })).toHaveValue(draft);
});
