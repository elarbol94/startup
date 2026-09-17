import { expect, test } from "@playwright/test";

test("every application section is reachable from the keyboard navigation", async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const credentials = { username: "admin", password: "super-secret-1" };
  let login = await page.request.post("/api/auth/sign-in/username", { data: credentials });
  if (!login.ok()) login = await page.request.post("/api/auth/sign-up/email", { data: { ...credentials, name: "E2E Admin", email: "admin@example.com" } });
  expect(login.ok()).toBe(true);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  for (const [key, route] of [
    ["calendar", "/calendar"], ["accounting", "/accounting"],
    ["personnel", "/personnel"], ["documents", "/documents"],
    ["projects", "/projects"], ["wiki", "/wiki"],
    ["municipalities", "/municipalities"], ["dashboard", "/"],
  ]) {
    await page.getByTestId("app-sidebar").locator(`[data-navigation-key="${key}"]`).press("Enter");
    await expect.poll(() => new URL(page.url()).pathname).toMatch(new RegExp(`^${route === "/" ? "/$" : route + "(?:/|$)"}`));
    await expect(page.locator("[data-app-main]")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Application error|Seite nicht gefunden|Page not found/ })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
