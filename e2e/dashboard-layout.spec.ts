import { expect, test, type Page } from "@playwright/test";

const cardsIn = (page: Page, column: "main" | "side") =>
  page.locator(`[data-overview-column="${column}"] > [data-overview-card]`).evaluateAll(nodes =>
    nodes.map(node => (node as HTMLElement).dataset.overviewCard));

test("dashboard cards can be hidden, moved across columns, remembered and reset", async ({ page }) => {
  test.setTimeout(180_000);
  const credentials = { username: "admin", password: "super-secret-1" };
  let response = await page.request.post("/api/auth/sign-in/username", { data: credentials });
  if (!response.ok()) response = await page.request.post("/api/auth/sign-up/email", { data: { ...credentials, name: "E2E Admin", email: "admin@example.com" } });
  expect(response.ok()).toBe(true);
  await page.goto("/");
  await expect(page.locator('[data-overview-card="news"]')).toBeVisible();
  expect(await cardsIn(page, "main")).toEqual(["tasks", "deadlines"]);
  expect(await cardsIn(page, "side")).toEqual(["kpis", "upNext", "news"]);

  await page.getByRole("button", { name: "Layout anpassen" }).click();
  await page.getByRole("button", { name: "Als Nächstes ausblenden" }).click();
  await expect(page.getByRole("button", { name: "Als Nächstes einblenden" })).toBeVisible();
  expect(await cardsIn(page, "side")).toEqual(["kpis", "news"]);

  // Drag "Neuigkeiten" by its handle over the lower half of the task card: it lands after it.
  const handle = (await page.getByRole("button", { name: "Neuigkeiten verschieben" }).boundingBox())!;
  const tasks = (await page.locator('[data-overview-card="tasks"]').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(tasks.x + tasks.width / 2, tasks.y + tasks.height - 30, { steps: 15 });
  await expect.poll(() => cardsIn(page, "main")).toEqual(["tasks", "news", "deadlines"]);
  await page.mouse.up();
  await expect.poll(() => cardsIn(page, "main")).toEqual(["tasks", "news", "deadlines"]);
  expect(await cardsIn(page, "side")).toEqual(["kpis"]);

  await page.getByRole("button", { name: "Fertig" }).click();
  await expect(page.getByRole("button", { name: "Neuigkeiten verschieben" })).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-overview-card="news"]')).toBeVisible();
  await expect.poll(() => cardsIn(page, "main")).toEqual(["tasks", "news", "deadlines"]);
  await expect(page.locator('[data-overview-card="upNext"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Layout anpassen" }).click();
  await page.getByRole("button", { name: "Layout zurücksetzen" }).click();
  await page.getByRole("button", { name: "Fertig" }).click();
  await expect.poll(() => cardsIn(page, "side")).toEqual(["kpis", "upNext", "news"]);
  expect(await cardsIn(page, "main")).toEqual(["tasks", "deadlines"]);
});
