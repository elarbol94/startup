import { expect, test } from "@playwright/test";
import { seedPresentation } from "./helpers/presentation-fixture";

test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);
const elements = [
  { id: "frame", type: "frame", x: 0, y: 0, width: 960, height: 540, rotation: 0, content: { label: "Overview", shape: "rect", color: "" } },
  { id: "opener", type: "shape", parentId: "frame", detailId: "page", x: 100, y: 100, width: 300, height: 120, rotation: 0,
    content: { shape: "roundedRect", text: "Detail", fill: "", stroke: "", strokeWidth: 2, opacity: 1 } },
  { id: "page", type: "frame", x: 1360, y: 100000, width: 960, height: 540, rotation: 0, content: { label: "Detail", shape: "rect", color: "" } },
  { id: "inside", type: "text", parentId: "page", x: 1460, y: 100100, width: 300, height: 120, rotation: 0, content: { text: "Content inside detail", fontSize: 32, bold: false, align: "left", color: "" } },
];
const steps = [{ id: "overview-stop", elementId: "frame" }, { id: "detail-stop", elementId: "page" }];

test("reloading an open detail page restores its scene and puts its content on screen", async ({ page }) => {
  const id = await seedPresentation(page, false, false, elements, { steps, waitFor: "opener" });
  await page.locator('.react-flow__node[data-id="opener"]').click();
  await page.getByTestId("ribbon-open-detail").click();
  await expect(page.getByTestId("detail-scene-bar")).toBeVisible();
  await expect(page.locator('.react-flow__node[data-id="inside"]')).toBeInViewport();
  await page.reload();
  await expect(page.getByTestId("detail-scene-bar")).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.react-flow__node[data-id="inside"]')).toBeInViewport();
  await expect(page.locator('.react-flow__node[data-id="opener"]')).toHaveCount(0);
  await page.screenshot({ path: "test-results/detail-after-reload.png" });
  await page.getByTestId("detail-scene-bar").getByRole("button", { name: "Übersicht", exact: true }).click();
  await expect(page.locator('.react-flow__node[data-id="opener"]')).toBeInViewport();
  await page.reload();
  await expect(page.getByTestId("detail-scene-bar")).toHaveCount(0);
  await expect(page.locator('.react-flow__node[data-id="opener"]')).toBeInViewport();
  await page.goto(`/wiki/presentations/${id}?scene=deleted-page`);
  await expect(page.getByTestId("detail-scene-bar")).toHaveCount(0);
  await expect(page.locator('.react-flow__node[data-id="opener"]')).toBeInViewport();
});

test("a distant unlinked frame cannot make the initial overview appear empty", async ({ page }) => {
  await seedPresentation(page, false, false, [...elements,
    { id: "orphan", type: "frame", x: 4107, y: 100000, width: 960, height: 540, rotation: 0, content: { label: "Unlinked page", shape: "rect", color: "" } },
  ], { steps, waitFor: "opener" });
  await expect(page.locator('.react-flow__node[data-id="opener"]')).toBeInViewport();
});
