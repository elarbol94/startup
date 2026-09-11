import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function login(page: Page) {
  const signupData = {
    name: "E2E Admin",
    username: "admin",
    displayUsername: "admin",
    email: "admin" + String.fromCharCode(64) + "example.com",
    password: "super-secret-1",
  };
  let signup = await page.request.post("/api/auth/sign-up/email", {
    data: signupData,
  });
  for (let attempt = 0; signup.status() === 404 && attempt < 2; attempt += 1) {
    await page.waitForTimeout(500);
    signup = await page.request.post("/api/auth/sign-up/email", {
      data: signupData,
    });
  }
  if (!signup.ok() && signup.status() !== 422 && signup.status() !== 403) {
    throw new Error(`Signup failed ${signup.status()}: ${await signup.text()}`);
  }
  if (!signup.ok()) {
    await page.goto("/login");
    await page.locator("#username").fill("admin");
    await page.locator("#password").fill("super-secret-1");
    const signIn = page.getByRole("button", { name: "Anmelden" });
    await expect(signIn).toBeEnabled({ timeout: 15_000 });
    await signIn.click();
  } else {
    await page.goto("/");
  }
  await expect(page.getByText("Willkommen, E2E Admin!")).toBeVisible();
}

test("calendar rail entry opens the Flow week and creates a timed event", async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 1000 });

  const appSidebar = page.getByTestId("app-sidebar");
  await appSidebar.hover();
  await expect
    .poll(
      async () => Math.round((await appSidebar.boundingBox())?.width ?? 0),
      { timeout: 10_000 },
    )
    .toBe(240);
  await appSidebar.getByRole("button", { name: "Kalender" }).click();
  await expect(page).toHaveURL(/\/calendar/, { timeout: 30_000 });
  await expect(page.getByTestId("calendar-week-scroll")).toBeVisible();
  await expect(page.getByRole("button", { name: "Filter", exact: true })).toBeVisible();
  await page.goto("/calendar?date=2026-07-29&view=week");

  await page.getByRole("button", { name: "Neuer Termin" }).click();
  await page.getByPlaceholder("Was findet statt?").fill("Weekly operations");
  await page.getByRole("textbox", { name: "Beginn-Datum" }).fill("29.07.2026");
  await page.getByRole("textbox", { name: "Beginn-Uhrzeit" }).fill("10:00");
  await page.getByRole("textbox", { name: "End-Uhrzeit" }).fill("11:00");
  await page.getByRole("button", { name: "Termin speichern" }).click();

  await expect(page.getByText("Weekly operations")).toBeVisible();
  await page.getByText("Weekly operations", { exact: true }).click();
  await expect(page.getByRole("heading", { name: "Weekly operations" })).toBeVisible();
  await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Weekly operations" })).toHaveCount(0);

  // Inspect each live preview before releasing the pointer, then verify persistence.
  for (const gesture of [
    { handle: "Beginn von Weekly operations ändern", edge: "top", time: "10:15", range: "10:15–11:00" },
    { handle: "Ende von Weekly operations ändern", edge: "bottom", time: "11:15", range: "10:15–11:15" },
    { handle: "Weekly operations · 10:15–11:15", edge: "top", time: "10:30", range: "10:30–11:30" },
  ]) {
    const handle = page.getByRole("button", { name: gesture.handle, exact: true });
    await handle.scrollIntoViewIfNeeded();
    const bounds = (await handle.boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2 + 15, { steps: 3 });
    const time = page.getByTestId("calendar-drag-time");
    await expect(time).toHaveText(gesture.time);
    await expect(time).toHaveAttribute("data-edge", gesture.edge);
    const badge = (await time.boundingBox())!;
    const card = (await time.locator("..").boundingBox())!;
    expect(Math.abs(badge.x + badge.width / 2 - card.x - card.width / 2)).toBeLessThan(3);
    if (gesture.edge === "top") expect(badge.y + badge.height).toBeLessThanOrEqual(card.y);
    else expect(badge.y).toBeGreaterThanOrEqual(card.y + card.height);
    await page.mouse.up();
    await expect(time).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Weekly operations · ${gesture.range}`, exact: true })).toBeEnabled();
  }
});

test("global new-event shortcut opens and clears the calendar dialog state", async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 1000 });

  const appSidebar = page.getByTestId("app-sidebar");
  await appSidebar.hover();
  await expect
    .poll(async () => Math.round((await appSidebar.boundingBox())?.width ?? 0))
    .toBe(240);
  await appSidebar.getByRole("link", { name: "Termin" }).click();

  await expect(page).toHaveURL(/\/calendar\?.*new=event/);
  await expect(page.getByRole("dialog", { name: "Neuer Termin" })).toBeVisible();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(page).not.toHaveURL(/new=event/);
});

test("calendar exposes month, agenda, and team views through URL state", async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/calendar?date=2026-07-29&view=week");

  await page.getByRole("button", { name: "Monat" }).click();
  await expect(page).toHaveURL(/view=month/);
  await page.getByRole("button", { name: "Agenda" }).click();
  await expect(page).toHaveURL(/view=agenda/);
  await page.getByRole("button", { name: "Team" }).click();
  await expect(page).toHaveURL(/view=team/);
  await expect(page.getByText("E2E Admin").last()).toBeVisible();
});

test("calendar defaults to agenda and exposes filters and event details on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page);
  await page.goto("/calendar?date=2026-07-29");

  await expect(page).toHaveURL(/view=agenda/);
  await expect(page.getByLabel("Kalenderansicht")).toHaveValue("agenda");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", { name: "Filter" }).click();
  const filtersSheet = page.getByRole("dialog", { name: "Filter" });
  await expect(filtersSheet).toBeVisible();
  await expect(filtersSheet.getByPlaceholder("Kalender durchsuchen…")).toBeVisible();
  await expect(filtersSheet.locator("[data-user-id]").first()).toBeVisible();
  await expect(filtersSheet.getByRole("button", { name: "Fertig", exact: true })).toBeVisible();
  await expect.poll(() => filtersSheet.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await filtersSheet.getByText("Personen & Terminarten", { exact: true }).click();
  await expect(filtersSheet.getByText("Arbeitsquellen")).toBeVisible();
  await filtersSheet.getByRole("button", { name: "Schließen" }).click();

  await page.getByRole("button", { name: "Neuer Termin" }).click();
  await page.getByPlaceholder("Was findet statt?").fill("Mobile review");
  await page.getByRole("textbox", { name: "Beginn-Uhrzeit" }).fill("15:00");
  await page.getByRole("textbox", { name: "End-Uhrzeit" }).fill("16:00");
  await page.getByRole("button", { name: "Termin speichern" }).click();
  await page.getByText("Mobile review", { exact: true }).click();

  const detailsSheet = page.getByRole("dialog", { name: "Details" });
  await expect(detailsSheet.getByRole("heading", { name: "Mobile review" })).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 900 });
  await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Mobile review" })).toBeVisible();
  await page.setViewportSize({ width: 1023, height: 900 });
  await expect(detailsSheet.getByRole("heading", { name: "Mobile review" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detailsSheet).toHaveCount(0);
  await expect(page.locator('[data-slot="sheet-overlay"]')).toHaveCount(0);
});
