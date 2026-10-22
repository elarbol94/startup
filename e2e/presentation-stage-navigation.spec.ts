import { expect, test, type Page } from "@playwright/test";
import { seedPresentation } from "./helpers/presentation-fixture";

test.use({ actionTimeout: 15000, viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);
const frame = (id: string, x: number, y: number) => ({ id, type: "frame", x, y, width: 960, height: 540, rotation: 0, content: { label: id, shape: "rect", color: "" } });
const shape = (id: string, parentId: string, x: number, y: number, detailId?: string) => ({ id, type: "shape", parentId, detailId, x, y, width: 280, height: 120, rotation: 0,
  content: { shape: "roundedRect", text: id, fill: "", stroke: "#172033", strokeWidth: 2, opacity: 1 } });
const elements = [
  frame("frame", 0, 0), shape("outer", "frame", 100, 100, "page"), shape("unlisted", "frame", 580, 300),
  frame("page", 0, 100000), shape("inner", "page", 100, 100100, "nested"),
  frame("nested", 1360, 100000), shape("deep", "nested", 1460, 100100),
];
const steps = [{ id: "root-stop", elementId: "frame" }, { id: "page-stop", elementId: "page" }, { id: "nested-stop", elementId: "nested" }];
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const player = (page: Page) => page.getByTestId("presentation-player");
const settle = (page: Page) => expect(player(page)).not.toHaveAttribute("data-turning");

test("reloading twice inside a nested detail keeps its content and lets every breadcrumb return", async ({ page }) => {
  const id = await seedPresentation(page, false, false, elements, { steps, waitFor: "outer" });
  await node(page, "outer").click(); await page.getByTestId("ribbon-open-detail").click();
  await expect(node(page, "inner")).toBeInViewport();
  await node(page, "inner").click(); await page.getByTestId("ribbon-open-detail").click();
  await expect(node(page, "deep")).toBeInViewport();
  await expect(page).toHaveURL(/scene=nested/);
  for (let i = 0; i < 2; i++) {
    await page.reload();
    await expect(page.getByTestId("detail-scene-bar")).toContainText("inner");
    await expect(node(page, "deep")).toBeInViewport();
    await expect(node(page, "outer")).toHaveCount(0);
    await expect(node(page, "inner")).toHaveCount(0);
  }
  await page.screenshot({ path: "test-results/nested-detail-after-reload.png" });
  await page.getByTestId("detail-scene-bar").getByRole("button", { name: "outer", exact: true }).click();
  await expect(node(page, "inner")).toBeInViewport();
  await page.reload(); await expect(node(page, "inner")).toBeInViewport();
  await page.getByTestId("detail-scene-bar").getByRole("button", { name: "Übersicht", exact: true }).click();
  await expect(node(page, "outer")).toBeInViewport();
  const saved = await (await page.request.get(`/api/wiki/presentations/${id}`)).json();
  expect(saved.elements).toHaveLength(elements.length);
  expect(saved.elements.find((e: { id: string }) => e.id === "outer").detailId).toBe("page");
  expect(saved.elements.find((e: { id: string }) => e.id === "inner").detailId).toBe("nested");
});

test("presentation clicks focus first, flip second, and right-click climbs one stage at a time", async ({ page }) => {
  const id = await seedPresentation(page, false, false, elements, { steps, waitFor: "outer" });
  await page.goto(`/wiki/presentations/${id}/present`);
  await expect(node(page, "outer")).toBeInViewport();
  const before = await node(page, "outer").boundingBox();
  await node(page, "outer").click();
  await expect(player(page)).not.toHaveAttribute("data-turning");
  await expect(player(page)).toHaveAttribute("data-scene", "overview");
  await expect.poll(async () => (await node(page, "outer").boundingBox())?.width ?? 0).toBeGreaterThan(before!.width * 1.5);
  // A focus with no path stop must stay in place, beyond the gesture snap-back timeout.
  const focusedWidth = (await node(page, "outer").boundingBox())!.width;
  await page.waitForTimeout(1300);
  expect((await node(page, "outer").boundingBox())!.width).toBeGreaterThan(focusedWidth * 0.9);
  await node(page, "outer").click();
  await expect(player(page)).toHaveAttribute("data-scene", "page"); await settle(page);
  await node(page, "inner").click(); await expect(player(page)).toHaveAttribute("data-scene", "page");
  await node(page, "inner").click(); await expect(player(page)).toHaveAttribute("data-scene", "nested"); await settle(page);
  await node(page, "deep").click();
  await expect(player(page)).toHaveAttribute("data-focused-element", "deep");
  await player(page).click({ button: "right", position: { x: 20, y: 20 } });
  await expect(player(page)).toHaveAttribute("data-scene", "nested");
  await expect(player(page)).not.toHaveAttribute("data-focused-element");
  await player(page).click({ button: "right", position: { x: 20, y: 20 } });
  await expect(player(page)).toHaveAttribute("data-scene", "page"); await settle(page);
  await expect(player(page)).toHaveAttribute("data-focused-element", "inner");
  await player(page).click({ button: "right", position: { x: 20, y: 20 } });
  await expect(player(page)).toHaveAttribute("data-scene", "page");
  await expect(player(page)).not.toHaveAttribute("data-focused-element");
  await player(page).click({ button: "right", position: { x: 20, y: 20 } });
  await expect(player(page)).toHaveAttribute("data-scene", "overview"); await settle(page);
  await expect(player(page)).toHaveAttribute("data-focused-element", "outer");
  await player(page).click({ button: "right", position: { x: 20, y: 20 } });
  await expect(player(page)).not.toHaveAttribute("data-focused-element");
  await expect(node(page, "unlisted")).toBeInViewport();
  await node(page, "unlisted").click();
  await expect(player(page)).toHaveAttribute("data-focused-element", "unlisted");
  await player(page).click({ button: "right", position: { x: 20, y: 20 } });
  await expect(node(page, "outer")).toBeInViewport();
  await page.screenshot({ path: "test-results/presentation-stage-return.png" });
});

test("a deck without an overview path still starts in the overview and supports two-click details", async ({ page }) => {
  const id = await seedPresentation(page, false, false, elements, { steps: [], waitFor: "outer" });
  await page.goto(`/wiki/presentations/${id}/present`);
  await expect(player(page)).toHaveAttribute("data-scene", "overview");
  await node(page, "outer").click();
  await expect(player(page)).toHaveAttribute("data-scene", "overview");
  await node(page, "outer").click();
  await expect(player(page)).toHaveAttribute("data-scene", "page"); await settle(page);
  await player(page).click({ button: "right", position: { x: 20, y: 20 } });
  await expect(player(page)).toHaveAttribute("data-scene", "overview");
});

test("right-click after choosing a sibling form returns to their containing canvas", async ({ page }) => {
  const id = await seedPresentation(page, false, false, elements, { steps, waitFor: "outer" });
  await page.goto(`/wiki/presentations/${id}/present`);
  await node(page, "outer").click();
  await expect(player(page)).toHaveAttribute("data-focused-element", "outer");
  await page.keyboard.press("Home");
  await expect(node(page, "unlisted")).toBeInViewport();
  await node(page, "unlisted").click();
  await expect(player(page)).toHaveAttribute("data-focused-element", "unlisted");
  await player(page).click({ button: "right", position: { x: 20, y: 20 } });
  await expect(player(page)).not.toHaveAttribute("data-focused-element");
  await expect(node(page, "outer")).toBeInViewport();
  await expect(node(page, "unlisted")).toBeInViewport();
});

test("player reload twice inside the second detail level restores its scene and upward navigation", async ({ page }) => {
  const id = await seedPresentation(page, false, false, elements, { steps, waitFor: "outer" });
  await page.goto(`/wiki/presentations/${id}/present`);
  await node(page, "outer").click(); await expect(player(page)).toHaveAttribute("data-focused-element", "outer");
  await node(page, "outer").click(); await expect(player(page)).toHaveAttribute("data-scene", "page"); await settle(page);
  await node(page, "inner").click(); await expect(player(page)).toHaveAttribute("data-focused-element", "inner");
  await node(page, "inner").click(); await expect(player(page)).toHaveAttribute("data-scene", "nested"); await settle(page);
  await expect(page).toHaveURL(/scene=nested/);
  for (let i = 0; i < 2; i++) {
    await page.reload();
    await expect(player(page)).toHaveAttribute("data-scene", "nested");
    await expect(node(page, "deep")).toBeInViewport();
    await expect(node(page, "outer")).toHaveCount(0);
    await expect(node(page, "inner")).toHaveCount(0);
  }
  await page.screenshot({ path: "test-results/player-second-detail-reload.png" });
  await player(page).click({ button: "right", position: { x: 20, y: 20 } });
  await expect(player(page)).toHaveAttribute("data-scene", "page"); await settle(page);
  await expect(node(page, "inner")).toBeInViewport();
  await player(page).click({ button: "right", position: { x: 20, y: 20 } });
  await expect(player(page)).toHaveAttribute("data-scene", "overview"); await settle(page);
  await expect(node(page, "outer")).toBeInViewport();
  await page.goto(`/wiki/presentations/${id}/present?scene=deleted&at=stale`);
  await expect(player(page)).toHaveAttribute("data-scene", "overview");
  await expect(node(page, "outer")).toBeInViewport();
  await expect(page).not.toHaveURL(/deleted|stale/);
});

test("overview fits widely separated scene content instead of leaving it outside the viewport", async ({ page }) => {
  const wide = [...elements, frame("distant", 0, 100000)];
  const id = await seedPresentation(page, false, false, wide, { steps, waitFor: "outer" });
  await page.goto(`/wiki/presentations/${id}/present`);
  await expect(node(page, "outer")).toBeInViewport();
  await page.getByTestId("presentation-controls").getByRole("button", { name: "Übersicht", exact: true }).click();
  await expect(node(page, "frame")).toBeInViewport();
  await expect(node(page, "distant")).toBeInViewport();
  await expect(node(page, "page")).toHaveCount(0);
  await page.screenshot({ path: "test-results/player-wide-overview.png" });
  // Home uses the same bounds in a detail canvas, without pulling other scenes into view.
  await page.goto(`/wiki/presentations/${id}/present?scene=nested&at=nested-stop`);
  await expect(node(page, "deep")).toBeInViewport();
  await page.keyboard.press("Home");
  await expect(node(page, "nested")).toBeInViewport();
  await expect(node(page, "deep")).toBeInViewport();
  await expect(node(page, "distant")).toHaveCount(0);
});
