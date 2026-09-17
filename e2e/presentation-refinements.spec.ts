import { expect, test, type Page } from "@playwright/test";
import { seedPresentation as seed } from "./helpers/presentation-fixture";
test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const canvas = (page: Page) => page.locator("[data-presentation-canvas]");
async function snapshot(page: Page, id: string) {
  await canvas(page).focus(); await page.keyboard.press("Control+s");
  await expect(page.getByTestId("collaboration-status").getByText("Gespeichert", { exact: true })).toBeVisible();
  return (await page.request.get(`/api/wiki/presentations/${id}`, { maxRetries: 2 })).json();
}
const shapes = [
  { id: "frame", type: "frame", x: 0, y: 0, width: 1000, height: 650, rotation: 0, content: { label: "Overview", shape: "rect", color: "" } },
  ...[100, 250, 600].map((x, i) => ({ id: ["a", "b", "c"][i], type: "shape", x, y: 100, width: 100, height: 80, rotation: 0, content: { shape: "rect", fill: "#6366f1", stroke: "", strokeWidth: 2, opacity: 1 } })),
];

test("insertion follows the cursor, commits only on click, and cancels with Escape", async ({ page }) => {
  const id = await seed(page); await page.getByRole("button", { name: "Text", exact: true }).click();
  const preview = page.getByTestId("presentation-placement-preview"); await expect(preview).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  const bounds = (await canvas(page).boundingBox())!; const point = { x: bounds.x + bounds.width * .7, y: bounds.y + bounds.height * .7 };
  await page.mouse.move(point.x, point.y);
  await expect.poll(async () => { const b = (await preview.boundingBox())!; return Math.abs(b.x + b.width / 2 - point.x); }).toBeLessThan(2);
  await page.mouse.click(point.x, point.y); await expect(preview).toHaveCount(0);
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(1); await expect(page.locator(".react-flow__node")).toHaveCount(5);
  expect((await snapshot(page, id)).elements).toHaveLength(5);
  await page.getByRole("button", { name: "Rahmen", exact: true }).click(); await expect(preview).toBeVisible();
  await canvas(page).focus(); await page.keyboard.press("Escape"); await expect(preview).toHaveCount(0);
  await page.keyboard.press("Control+z"); await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.getByRole("button", { name: "Einfügen", exact: true }).click();
  await page.getByRole("menuitem", { name: "Form", exact: true }).hover();
  await page.getByRole("menuitem", { name: "Raute", exact: true }).click();
  await expect(canvas(page)).toBeFocused(); await page.keyboard.press("Escape"); await expect(preview).toHaveCount(0);
});

test("minimap outlines enclosing frames and clicking a location centers the canvas", async ({ page }) => {
  await seed(page);
  const mini = page.getByTestId("presentation-minimap-object"); await expect(mini).toHaveCount(4);
  await expect(mini.first()).toHaveAttribute("fill", "none");
  const target = mini.nth(1), box = (await target.boundingBox())!;
  const click = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  const world = await page.locator(".react-flow__minimap-svg").evaluate((el, click) => {
    const point = new DOMPoint(click.x, click.y).matrixTransform((el as SVGSVGElement).getScreenCTM()!.inverse());
    return { x: point.x, y: point.y };
  }, click);
  await page.mouse.click(click.x, click.y);
  await expect.poll(() => page.locator(".react-flow__viewport").evaluate((el, world) => {
    const matrix = new DOMMatrix(getComputedStyle(el).transform), c = el.closest("[data-presentation-canvas]")!.getBoundingClientRect();
    return Math.abs(world.x * matrix.a + matrix.e - c.width / 2) + Math.abs(world.y * matrix.d + matrix.f - c.height / 2);
  }, world)).toBeLessThan(3);
  await page.screenshot({ path: "output/playwright/presentation-minimap-refined.png", animations: "disabled" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({ path: "output/playwright/presentation-minimap-refined-dark.png", animations: "disabled" });
});

test("equal distance and alignment guides appear while moving and Ctrl-dragging copies", async ({ page }) => {
  const id = await seed(page, false, false, shapes);
  const a = (await node(page, "a").boundingBox())!, b = (await node(page, "b").boundingBox())!;
  const zoom = a.width / 100;
  await page.keyboard.down("Control"); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 150 * zoom, b.y + b.height / 2, { steps: 10 });
  await expect(page.getByTestId("presentation-distance-guide")).toHaveCount(2);
  await expect(page.getByTestId("presentation-snap-guide").first()).toBeVisible();
  await expect(page.getByTestId("presentation-distance-guide").first()).toContainText("50");
  await page.keyboard.press("Escape"); await page.mouse.up(); await page.keyboard.up("Control"); await expect(page.locator(".react-flow__node")).toHaveCount(4);
  const c = (await node(page, "c").boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2); await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2 - 200 * zoom, c.y + c.height / 2, { steps: 12 });
  // React Flow establishes its drag anchor after crossing the movement threshold.
  // Move the rendered box onto the desired gap, accounting for that initial offset.
  const moved = (await node(page, "c").boundingBox())!;
  await page.mouse.move(c.x + c.width / 2 - 200 * zoom + (c.x - 200 * zoom - moved.x), c.y + c.height / 2);
  await expect(page.getByTestId("presentation-distance-guide")).toHaveCount(2); await page.mouse.up();
  expect((await snapshot(page, id)).elements.find((e: { id: string }) => e.id === "c").x).toBeCloseTo(400, 0);
});

test("rotation magnetically stops on vertical without requiring exact pointer placement", async ({ page }) => {
  const id = await seed(page, false, false, shapes.map(element => element.id === "b" ? { ...element, rotation: 30 } : element)); await node(page, "a").click();
  const box = (await node(page, "a").boundingBox())!, handle = (await page.getByRole("button", { name: "Auswahl drehen" }).boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2, radius = cy - handle.y;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(cx + radius * Math.cos(-2 * Math.PI / 180), cy + radius * Math.sin(-2 * Math.PI / 180), { steps: 15 }); await page.mouse.up();
  expect((await snapshot(page, id)).elements.find((e: { id: string }) => e.id === "a").rotation).toBeCloseTo(90, 0);
  const rotated = (await node(page, "a").boundingBox())!, nextHandle = (await page.getByRole("button", { name: "Auswahl drehen" }).boundingBox())!;
  const center = { x: rotated.x + rotated.width / 2, y: rotated.y + rotated.height / 2 };
  const start = { x: nextHandle.x + nextHandle.width / 2, y: nextHandle.y + nextHandle.height / 2 };
  const distance = Math.hypot(start.x - center.x, start.y - center.y);
  const angle = Math.atan2(start.y - center.y, start.x - center.x) - 58 * Math.PI / 180;
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(center.x + distance * Math.cos(angle), center.y + distance * Math.sin(angle), { steps: 12 }); await page.mouse.up();
  expect((await snapshot(page, id)).elements.find((e: { id: string }) => e.id === "a").rotation).toBe(30);
  await page.keyboard.press("Control+z");
  expect((await snapshot(page, id)).elements.find((e: { id: string }) => e.id === "a").rotation).toBe(90);
});

test("font and sentence edits grow text boxes, preserve formatting, and sync their geometry", async ({ page, context }) => {
  const id = await seed(page); const other = await context.newPage(); await other.goto(`/wiki/presentations/${id}`); await expect(node(other, "a")).toBeVisible();
  await node(page, "a").click(); await page.getByRole("button", { name: "Werkzeuge", exact: true }).click(); await page.getByRole("menuitem", { name: "Eigenschaften", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Schriftgröße", exact: true }).fill("128"); await page.keyboard.press("Tab");
  const enlarged = (await snapshot(page, id)).elements.find((e: { id: string }) => e.id === "a");
  expect(enlarged.width).toBeGreaterThan(260); expect(enlarged.height).toBeGreaterThan(140); expect(enlarged.content.runs[0].bold).toBe(true);
  await page.getByRole("button", { name: "Seitenbereich schließen" }).click(); await node(page, "a").dblclick();
  const editor = node(page, "a").locator(".ProseMirror"); await expect(editor).toBeFocused();
  const sentence = "This longer sentence should wrap naturally and keep every word visible as the text box grows.";
  await editor.fill(sentence); await page.keyboard.press("Escape");
  const grown = (await snapshot(page, id)).elements.find((e: { id: string }) => e.id === "a");
  expect(grown.height).toBeGreaterThan(enlarged.height); expect(grown.width).toBeLessThanOrEqual(720);
  await expect(node(other, "a")).toContainText(sentence);
  await expect.poll(() => node(other, "a").evaluate(el => Number.parseFloat((el as HTMLElement).style.height))).toBe(grown.height);
  await page.reload(); await expect(node(page, "a")).toContainText(sentence); await other.close();
});
