import { expect, test } from "@playwright/test";
import { loginAsAnyUser } from "./helpers/login";


test("the app is installable and push notifications are managed in the profile", async ({ page }) => {
  test.slow();
  // Headless Chromium always reports Notification.permission as "denied"; act like a
  // browser that has not asked yet.
  await page.addInitScript(() => Object.defineProperty(Notification, "permission", { get: () => "default" }));
  await loginAsAnyUser(page);
  await page.goto("/settings/profile");

  // Installability: credentialed manifest link, manifest, icons and service worker.
  const manifestLink = page.locator('link[rel="manifest"]');
  await expect(manifestLink).toHaveAttribute("href", "/app.webmanifest");
  await expect(manifestLink).toHaveAttribute("crossorigin", "use-credentials");
  const manifest = await (await page.request.get("/app.webmanifest")).json();
  expect(manifest).toMatchObject({ display: "standalone", start_url: "/" });
  for (const icon of manifest.icons as { src: string }[]) {
    const response = await page.request.get(icon.src);
    expect(response.headers()["content-type"]).toBe("image/png");
  }
  expect((await page.request.get("/app-icon/badge")).ok()).toBe(true);
  expect((await page.request.get("/app-icon/unknown")).status()).toBe(404);
  await expect.poll(() => page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration("/")))).toBe(true);

  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "Push-Benachrichtigungen" }) });
  await expect(card.getByRole("button", { name: "Auf diesem Gerät aktivieren" })).toBeVisible();
  await expect(card.getByText("Auf diesem Gerät nicht aktiv.")).toBeVisible();

  const calendar = card.getByRole("checkbox", { name: "Kalender-Erinnerungen" });
  await expect(calendar).toBeChecked();
  await calendar.click();
  await expect(calendar).not.toBeChecked();
  await expect.poll(async () => {
    await page.reload();
    return card.getByRole("checkbox", { name: "Kalender-Erinnerungen" }).getAttribute("aria-checked");
  }).toBe("false");
  await card.getByRole("checkbox", { name: "Kalender-Erinnerungen" }).click();
  await expect(card.getByRole("checkbox", { name: "Kalender-Erinnerungen" })).toBeChecked();
});
