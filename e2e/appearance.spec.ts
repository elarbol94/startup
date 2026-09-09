import { expect, test } from "@playwright/test";

test("appearance follows the system, supports overrides, and persists across the platform", async ({ page, context }) => {
  test.slow();
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  await expect(page.locator("html")).toHaveClass(/dark/);

  const signup = await page.request.post("/api/auth/sign-up/email", {
    data: { name: "E2E Admin", username: "admin", email: "admin@example.com", password: "super-secret-1" },
  });
  if (!signup.ok()) {
    const login = await page.request.post("/api/auth/sign-in/username", {
      data: { username: "admin", password: "super-secret-1" },
    });
    expect(login.ok()).toBeTruthy();
  }
  await page.goto("/settings/profile");
  const system = page.getByRole("radio", { name: "System", exact: true });
  await expect(system).toBeChecked();
  await expect(page.locator("body")).toHaveCSS("color-scheme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.getByRole("radio", { name: "Hell", exact: true }).check();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.reload();
  await expect(page.getByRole("radio", { name: "Hell", exact: true })).toBeChecked();
  await expect(page.locator("html")).toHaveClass(/light/);

  const otherTab = await context.newPage();
  await otherTab.goto("/settings/profile");
  await page.getByRole("radio", { name: "Dunkel", exact: true }).check();
  await expect(otherTab.locator("html")).toHaveClass(/dark/);
  await otherTab.close();
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.goto("/accounting");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.goto("/settings/profile");
  await expect(page.getByRole("radio", { name: "Dunkel", exact: true })).toBeChecked();
  await system.check();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.reload();
  await expect(system).toBeChecked();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
});
