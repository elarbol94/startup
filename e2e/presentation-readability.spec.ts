import { expect, test, type Page } from "@playwright/test";
import { seedPresentation as seed } from "./helpers/presentation-fixture";

/** Slides stay readable in the app's dark mode, and the View menu's grid is drawn on the slide. */
test.use({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
test.setTimeout(180_000);

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const canvas = (page: Page) => page.locator("[data-presentation-canvas]");
const slide = { id: "slide", type: "shape", x: 0, y: 0, width: 960, height: 540, rotation: 0, content: { shape: "rect", fill: "#ffffff", stroke: "", strokeWidth: 0, opacity: 1 } };
const plain = { id: "a", type: "text", x: 100, y: 100, width: 300, height: 60, rotation: 0, content: { text: "Ohne Farbe", fontSize: 32, bold: false, align: "left", color: "" } };

test("uncoloured text on a white slide is dark, also while it is edited", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await seed(page, false, false, [slide, plain]);
  await expect(page.locator("html")).toHaveClass(/(^| )dark( |$)/);
  const text = node(page, "a").locator("[data-presentation-text]");
  await expect(text).toHaveCSS("color", "rgb(31, 41, 55)");
  await node(page, "a").dblclick();
  const editor = node(page, "a").locator(".ProseMirror");
  await expect(editor).toBeFocused();
  await expect(editor).toHaveCSS("color", "rgb(31, 41, 55)");
  // The edit surface no longer paints the app's (dark) background over the slide.
  const surface = node(page, "a").locator(".cursor-text").first();
  await expect(surface).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
});

test("the grid is drawn over the slide and the View menu shows real key names", async ({ page }) => {
  await seed(page, false, false, [slide, plain]);
  await page.getByTestId("presentation-view-menu").click();
  const menu = page.getByRole("menu");
  await expect(menu).toContainText("Umschalt+F9");
  await expect(menu).toContainText("Alt+F9");
  await expect(menu).not.toContainText("shortcuts.");
  await page.getByTestId("view-gridlines").click();
  const overlay = page.getByTestId("presentation-grid-overlay");
  await expect(overlay).toBeVisible();
  // One grid only: the shown gridlines replace React Flow's background dots.
  await expect(page.locator(".react-flow__background")).toHaveCount(0);
  // Above the slide's node layer, not React Flow's background under it.
  const layers = await overlay.evaluate((svg) => ({
    grid: Number(getComputedStyle(svg).zIndex),
    nodes: Number(getComputedStyle(svg.closest(".react-flow")!.querySelector(".react-flow__renderer")!).zIndex),
  }));
  expect(layers.grid).toBeGreaterThan(layers.nodes);
  await canvas(page).focus();
  await page.keyboard.press("Shift+F9");
  await expect(overlay).toHaveCount(0);
});

test("the zoom buttons move clear of the vertical ruler", async ({ page }) => {
  await seed(page, false, false, [slide, plain]);
  await page.getByTestId("presentation-view-menu").click();
  await page.getByTestId("view-ruler").click();
  const ruler = await page.getByTestId("presentation-ruler-vertical").boundingBox();
  const controls = await page.locator(".react-flow__controls").boundingBox();
  expect(ruler && controls && controls.x >= ruler.x + ruler.width).toBe(true);
});

test("the grid's transparency slider changes how strongly the dots show", async ({ page }) => {
  await seed(page, false, false, [slide, plain]);
  await page.getByTestId("presentation-view-menu").click();
  await page.getByTestId("view-gridlines").click();
  await page.getByTestId("presentation-view-menu").click();
  await page.getByTestId("view-grid-settings").click();
  const slider = page.getByTestId("presentation-grid-transparency");
  await expect(slider).toHaveValue("15");
  await slider.fill("50");
  const dots = page.getByTestId("presentation-grid-overlay").locator("rect");
  await expect(dots).toHaveAttribute("opacity", "0.5");
});
