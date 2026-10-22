import { expect, test, type Page } from "@playwright/test";
import { seedPresentation } from "./helpers/presentation-fixture";

test.use({ actionTimeout: 15000, viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);
const frame = (id: string, x: number, y: number) => ({ id, type: "frame", x, y, width: 960, height: 540, rotation: 0, content: { label: id, shape: "rect", color: "" } });
const form = (id: string, parentId: string, x: number, y: number, detailId?: string) => ({ id, type: "shape", parentId, detailId, x, y, width: 280, height: 120, rotation: 0,
  content: { shape: "roundedRect", text: id, fill: "", stroke: "#172033", strokeWidth: 2, opacity: 1 } });
const elements = [
  frame("first", 0, 0), form("outer", "first", 100, 100, "detail"),
  frame("second", 1600, 0), form("other", "second", 1700, 100),
  frame("detail", 0, 100000), form("inner", "detail", 100, 100100, "nested"),
  frame("nested", 1360, 100000), form("deep", "nested", 1460, 100100),
];
const steps = ["first", "second", "detail", "nested"].map(id => ({ id: id + "-stop", elementId: id }));
const node = (page: Page, id: string) => page.getByTestId("presentation-player").getByTestId("rf__node-" + id);
const player = (page: Page) => page.getByTestId("presentation-player");
const settle = (page: Page) => expect(player(page)).not.toHaveAttribute("data-turning");
const right = (page: Page) => player(page).click({ button: "right", position: { x: 20, y: 20 } });
const doubleRight = async (page: Page, interval = 80) => {
  await right(page);
  await page.waitForTimeout(interval);
  await right(page);
};
async function seed(page: Page, startMode: "path" | "free" = "path") {
  return seedPresentation(page, false, false, elements, { steps, settings: { startMode }, waitFor: "outer" });
}

test("the launch menu offers first-path focus and free canvas exploration", async ({ page }) => {
  await seed(page);
  await page.getByTestId("presentation-start-options").click();
  await expect(page.getByRole("menuitem").filter({ hasText: "Erste Station fokussieren" })).toBeVisible();
  await expect(page.getByRole("menu")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/presentation-start-menu.png" });
  await page.getByRole("menuitem").filter({ hasText: "Freier Modus" }).click();
  await expect(player(page)).toHaveAttribute("data-mode", "free");
  await expect(player(page)).toHaveAttribute("data-view", "canvas");
  await expect(node(page, "first")).toBeInViewport({ ratio: 1 });
  await expect(node(page, "second")).toBeInViewport({ ratio: 1 });
  const before = await page.getByTestId("presentation-controls").innerText();
  await player(page).click({ position: { x: 20, y: 20 } });
  expect(await page.getByTestId("presentation-controls").innerText()).toBe(before);
  await page.screenshot({ path: "test-results/presentation-free-overview.png" });
  await node(page, "outer").click();
  await expect(player(page)).toHaveAttribute("data-focused-element", "outer");
  await right(page);
  await expect(player(page)).toHaveAttribute("data-view", "canvas");
  await expect(node(page, "second")).toBeInViewport();
});

test("path mode remains the default and an explicit launch can override the saved free-mode preference", async ({ page }) => {
  const id = await seed(page);
  await page.goto(`/wiki/presentations/${id}/present`);
  await expect(player(page)).toHaveAttribute("data-mode", "path");
  await expect(player(page)).toHaveAttribute("data-view", "stop");
  await expect(node(page, "first")).toBeInViewport();
  await expect(node(page, "second")).not.toBeInViewport();
  await page.goto(`/wiki/presentations/${id}`);
  await page.getByRole("tab", { name: "Bildschirmpräsentation", exact: true }).click();
  await page.getByRole("button", { name: "Wiedergabeeinstellungen", exact: true }).click();
  await page.getByTestId("presentation-start-mode").selectOption("free");
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "Präsentieren", exact: true }).click();
  await expect(player(page)).toHaveAttribute("data-mode", "free");
  await expect(node(page, "second")).toBeInViewport();
  await page.reload();
  await expect(player(page)).toHaveAttribute("data-mode", "free");
  await expect(player(page)).toHaveAttribute("data-view", "canvas");
  await page.goto(`/wiki/presentations/${id}/present?mode=path`);
  await expect(player(page)).toHaveAttribute("data-mode", "path");
  await expect(node(page, "second")).not.toBeInViewport();
  await page.goto(`/wiki/presentations/${id}/present?mode=free&from=second-stop`);
  await expect(player(page)).toHaveAttribute("data-view", "stop");
  await expect(node(page, "second")).toBeInViewport();
  await expect(node(page, "first")).not.toBeInViewport();
});

for (const interval of [80, 450]) test(`double-right-click (${interval}ms) returns directly from nested details to the original canvas`, async ({ page }) => {
  const id = await seed(page);
  await page.goto(`/wiki/presentations/${id}/present?scene=nested&at=nested-stop`);
  await expect(node(page, "deep")).toBeInViewport();
  await node(page, "deep").click();
  await expect(player(page)).toHaveAttribute("data-focused-element", "deep");
  await doubleRight(page, interval);
  await expect(player(page)).toHaveAttribute("data-scene", "overview");
  await expect(player(page)).toHaveAttribute("data-view", "canvas");
  await expect(player(page)).not.toHaveAttribute("data-focused-element");
  await expect(node(page, "first")).toBeInViewport({ ratio: 1 });
  await expect(node(page, "second")).toBeInViewport({ ratio: 1 });
  await expect(node(page, "nested")).toHaveCount(0);
  await page.waitForTimeout(800);
  await expect(player(page)).toHaveAttribute("data-scene", "overview");
  await page.reload();
  await expect(player(page)).toHaveAttribute("data-scene", "overview");
  await expect(player(page)).toHaveAttribute("data-view", "canvas");
  await expect(node(page, "second")).toBeInViewport({ ratio: 1 });
  // No stale detail return trail survives the jump or reload.
  await right(page);
  await page.waitForTimeout(800);
  await expect(player(page)).toHaveAttribute("data-scene", "overview");
});

test("free mode preserves panning, opens both detail levels in canvas view, and survives reload", async ({ page }) => {
  const id = await seed(page, "free");
  await page.goto(`/wiki/presentations/${id}/present`);
  await expect(node(page, "second")).toBeInViewport();
  await page.mouse.move(20, 200); await page.mouse.down();
  await page.mouse.move(90, 270, { steps: 8 }); await page.mouse.up();
  const moved = await player(page).locator(".react-flow__viewport").getAttribute("style");
  await page.waitForTimeout(1400);
  expect(await player(page).locator(".react-flow__viewport").getAttribute("style")).toBe(moved);
  await doubleRight(page);
  await expect(node(page, "outer")).toBeInViewport();
  await node(page, "outer").click(); await expect(player(page)).toHaveAttribute("data-focused-element", "outer");
  await node(page, "outer").click(); await expect(player(page)).toHaveAttribute("data-scene", "detail"); await settle(page);
  await expect(player(page)).toHaveAttribute("data-view", "canvas");
  await node(page, "inner").click(); await expect(player(page)).toHaveAttribute("data-focused-element", "inner");
  await node(page, "inner").click(); await expect(player(page)).toHaveAttribute("data-scene", "nested"); await settle(page);
  await expect(player(page)).toHaveAttribute("data-view", "canvas");
  await page.reload();
  await expect(player(page)).toHaveAttribute("data-scene", "nested");
  await expect(player(page)).toHaveAttribute("data-mode", "free");
  await expect(node(page, "deep")).toBeInViewport();
  await right(page); await expect(player(page)).toHaveAttribute("data-scene", "detail"); await settle(page);
  await right(page); await expect(player(page)).toHaveAttribute("data-scene", "overview"); await settle(page);
  await expect(node(page, "second")).toBeInViewport();
});

test("start-mode choices remain readable on a narrow screen", async ({ page }) => {
  await seed(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("presentation-start-options").click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(page.getByRole("menuitem").filter({ hasText: "Freier Modus" })).toBeInViewport({ ratio: 1 });
  const bounds = (await menu.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await expect(menu).toHaveCSS("opacity", "1");
  await page.screenshot({ path: "test-results/presentation-start-menu-mobile.png" });
});
