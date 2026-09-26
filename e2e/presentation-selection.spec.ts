import { expect, test, type Page } from "@playwright/test";
import { seedPresentation as seed } from "./helpers/presentation-fixture";

/** Selection and shortcut conventions: modifier clicks, frames, shortcuts after toolbar clicks, wheel, placement, clipboard. */
// No clipboard permissions: copy and paste must not depend on them.
test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);

type Element = { id: string; type: string; x: number; y: number; width: number; height: number; parentId?: string };
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const selected = (page: Page) => page.locator(".react-flow__node.selected");
const canvas = (page: Page) => page.locator("[data-presentation-canvas]");

async function saved(page: Page, id: string): Promise<{ elements: Element[] }> {
  await canvas(page).focus(); await page.keyboard.press("Control+s");
  await expect(page.getByTestId("collaboration-status").getByText("Gespeichert", { exact: true })).toBeVisible();
  return (await page.request.get(`/api/wiki/presentations/${id}`, { maxRetries: 2 })).json();
}
async function transform(page: Page) {
  return page.locator(".react-flow__viewport").first().evaluate((el) => { const m = new DOMMatrix(getComputedStyle(el).transform); return { zoom: m.a, x: m.e, y: m.f }; });
}
/** Screen position of a canvas point, measured against the viewport's own coordinate origin. */
async function screen(page: Page, point: { x: number; y: number }) {
  return page.locator(".react-flow__viewport").first().evaluate((el, p) => {
    const m = new DOMMatrix(getComputedStyle(el).transform), parent = el.parentElement!.getBoundingClientRect();
    return { x: parent.left + m.e + p.x * m.a, y: parent.top + m.f + p.y * m.a };
  }, point);
}
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 }); await page.mouse.up();
}
async function shiftClick(page: Page, x: number, y: number) {
  await page.keyboard.down("Shift"); await page.mouse.click(x, y); await page.keyboard.up("Shift");
}
const frameOf = (deck: { elements: Element[] }) => deck.elements.find((e) => e.id === "frame")!;

test("Shift- and Ctrl-click add and remove objects, groups included, and a plain drag draws a marquee", async ({ page }) => {
  await seed(page);
  await node(page, "a").click();
  await node(page, "b").click({ modifiers: ["Shift"] }); await expect(selected(page)).toHaveCount(2);
  await node(page, "b").click({ modifiers: ["Shift"] }); await expect(selected(page)).toHaveCount(1);
  await expect(node(page, "a")).toHaveClass(/selected/);
  await node(page, "line").click({ modifiers: ["Control"] }); await expect(selected(page)).toHaveCount(2);
  await node(page, "line").click({ modifiers: ["Control"] }); await expect(selected(page)).toHaveCount(1);
  // Shift-click on empty canvas outside every frame keeps the selection; a plain click clears it.
  const outside = await screen(page, { x: 1050, y: 250 });
  await shiftClick(page, outside.x, outside.y); await expect(selected(page)).toHaveCount(1);
  const elsewhere = await screen(page, { x: 1050, y: 450 }); // not a second click on the same spot, which would be a double-click
  await page.mouse.click(elsewhere.x, elsewhere.y); await expect(selected(page)).toHaveCount(0);

  // A plain drag starting inside the frame's empty interior draws a marquee around a and b.
  const from = await screen(page, { x: 60, y: 60 }), to = await screen(page, { x: 800, y: 250 });
  await drag(page, from, to);
  await expect(selected(page)).toHaveCount(2);
  await expect(node(page, "frame")).not.toHaveClass(/selected/);

  // A group toggles as a whole from any of its members.
  await canvas(page).focus(); await page.keyboard.press("Control+g"); await expect(selected(page)).toHaveCount(1);
  const group = await selected(page).getAttribute("data-id");
  await node(page, "line").click(); await expect(node(page, "line")).toHaveClass(/selected/);
  await node(page, "a").click({ modifiers: ["Shift"] }); await expect(selected(page)).toHaveCount(2);
  await expect(node(page, group!)).toHaveClass(/selected/);
  await node(page, "b").click({ modifiers: ["Shift"] }); await expect(selected(page)).toHaveCount(1);
  await expect(node(page, group!)).not.toHaveClass(/selected/);
  await node(page, "a").click({ modifiers: ["Control"] }); await expect(node(page, group!)).toHaveClass(/selected/);
  await node(page, "a").click({ modifiers: ["Control"] }); await expect(node(page, group!)).not.toHaveClass(/selected/);
});

test("frames are selected from their interior and label, moved by label and edge, and marqueed inside", async ({ page }) => {
  const id = await seed(page);
  const interior = await screen(page, { x: 800, y: 500 });
  await page.mouse.click(interior.x, interior.y); await expect(node(page, "frame")).toHaveClass(/selected/); await expect(selected(page)).toHaveCount(1);
  await node(page, "a").click(); await node(page, "b").click({ modifiers: ["Shift"] });
  await shiftClick(page, interior.x, interior.y); await expect(selected(page)).toHaveCount(3);
  await shiftClick(page, interior.x, interior.y); await expect(selected(page)).toHaveCount(2);

  await page.keyboard.press("Escape"); await expect(selected(page)).toHaveCount(0);
  const label = node(page, "frame").locator("[data-frame-label]");
  await label.click(); await expect(node(page, "frame")).toHaveClass(/selected/);

  const before = frameOf(await saved(page, id));
  const { zoom } = await transform(page);
  const grip = (await label.boundingBox())!;
  await drag(page, { x: grip.x + 10, y: grip.y + grip.height / 2 }, { x: grip.x + 10 + 100 * zoom, y: grip.y + grip.height / 2 + 60 * zoom });
  const moved = frameOf(await saved(page, id));
  // Snapping may adjust the drop by a few units.
  expect(Math.abs(moved.x - before.x - 100)).toBeLessThan(20); expect(Math.abs(moved.y - before.y - 60)).toBeLessThan(20);
  expect([moved.width, moved.height]).toEqual([before.width, before.height]);

  // The top edge between two resize handles moves the frame; it never resizes it.
  await expect(node(page, "frame")).toHaveClass(/selected/);
  const edge = await screen(page, { x: moved.x + moved.width * 0.25, y: moved.y });
  await drag(page, edge, { x: edge.x - 80 * zoom, y: edge.y + 40 * zoom });
  const edged = frameOf(await saved(page, id));
  expect(Math.abs(edged.x - moved.x + 80)).toBeLessThan(20); expect(Math.abs(edged.y - moved.y - 40)).toBeLessThan(20);
  expect([edged.width, edged.height]).toEqual([before.width, before.height]);
  // A few pixels inside the edge is still the edge band, at this zoom and when zoomed out.
  await page.locator(".react-flow__controls-zoomout").click(); await page.locator(".react-flow__controls-zoomout").click();
  await page.keyboard.press("Escape");
  await expect(selected(page)).toHaveCount(0);
  const near = await screen(page, { x: edged.x + edged.width * 0.5, y: edged.y });
  await page.mouse.click(near.x, near.y + 4); await expect(node(page, "frame")).toHaveClass(/selected/);
});

test("shortcuts keep working after a toolbar click, but not inside a text editor", async ({ page }) => {
  await seed(page);
  const texts = page.locator(".react-flow__node-text");
  await node(page, "a").click(); await page.keyboard.press("Delete"); await expect(texts).toHaveCount(1);
  // The undo button disables itself once there is nothing left to undo: focus falls back to the page.
  await page.getByRole("button", { name: "Rückgängig", exact: true }).click(); await expect(texts).toHaveCount(2);
  await page.keyboard.press("Control+y"); await expect(texts).toHaveCount(1);
  await page.keyboard.press("Control+z"); await expect(texts).toHaveCount(2);
  await page.keyboard.press("Control+Shift+z"); await expect(texts).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0); // Ctrl+Y did not open the bug reporter
  await page.getByRole("button", { name: "Wiederholen", exact: true }).isDisabled();
  await page.getByRole("button", { name: "Rückgängig", exact: true }).click(); await expect(texts).toHaveCount(2);

  const path = page.getByRole("button", { name: "Weg", exact: true });
  await path.click(); await expect(path).toBeFocused();
  await page.keyboard.press("Control+a"); await expect(node(page, "frame")).toHaveClass(/selected/);
  await page.keyboard.press("Escape"); await expect(selected(page)).toHaveCount(0);
  await node(page, "b").click(); await path.click(); await expect(path).toBeFocused();
  await page.keyboard.press("Delete"); await expect(texts).toHaveCount(1);
  await page.keyboard.press("Control+z"); await expect(texts).toHaveCount(2);

  await node(page, "a").dblclick();
  const editor = node(page, "a").locator(".ProseMirror"); await expect(editor).toBeFocused();
  await page.keyboard.press("Control+a");
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("First idea");
  await expect(selected(page)).toHaveCount(1);
  await page.keyboard.press("Escape");
});

test("the wheel pans, Ctrl+wheel zooms", async ({ page }) => {
  await seed(page);
  const spot = await screen(page, { x: 800, y: 500 });
  await page.mouse.move(spot.x, spot.y);
  const start = await transform(page);
  await page.mouse.wheel(120, 90);
  await expect.poll(async () => (await transform(page)).x).not.toBeCloseTo(start.x, 0);
  const panned = await transform(page);
  expect(panned.y).not.toBeCloseTo(start.y, 0);
  expect(panned.zoom).toBeCloseTo(start.zoom, 5);
  await page.keyboard.down("Control"); await page.mouse.wheel(0, -300); await page.keyboard.up("Control");
  await expect.poll(async () => (await transform(page)).zoom).toBeGreaterThan(start.zoom * 1.05);
});

test("placing from the insert menu takes focus to the canvas: Enter places, Escape cancels", async ({ page }) => {
  await seed(page);
  const shapes = page.locator(".react-flow__node-shape");
  const insert = async () => {
    await page.getByRole("button", { name: "Einfügen", exact: true }).click(); await page.getByRole("menuitem", { name: "Form", exact: true }).hover();
    await page.getByRole("menuitem", { name: "Rechteck", exact: true }).click();
    await expect(page.getByTestId("presentation-placement-preview")).toBeAttached();
    await expect(canvas(page)).toBeFocused();
  };
  await insert(); await page.keyboard.press("Enter");
  await expect(page.getByTestId("presentation-placement-preview")).toHaveCount(0); await expect(shapes).toHaveCount(2);
  await insert(); await page.keyboard.press("Escape");
  await expect(page.getByTestId("presentation-placement-preview")).toHaveCount(0); await expect(shapes).toHaveCount(2);
});

test("copy and repeated paste work at once without clipboard permission, each paste offset from the last", async ({ page }) => {
  const id = await seed(page);
  const texts = page.locator(".react-flow__node-text");
  await node(page, "a").click();
  await page.keyboard.press("Control+c");
  for (let count = 3; count <= 5; count++) {
    await page.keyboard.press("Control+v");
    await expect(texts).toHaveCount(count, { timeout: 1_000 });
  }
  const deck = await saved(page, id);
  const pasted = deck.elements.filter((e) => e.type === "text" && !["a", "b"].includes(e.id)).sort((p, q) => p.x - q.x);
  const original = deck.elements.find((e) => e.id === "a")!;
  expect(pasted).toHaveLength(3);
  expect(pasted.some((e) => e.x === original.x && e.y === original.y)).toBe(false);
  for (let index = 1; index < pasted.length; index++) {
    expect(pasted[index].x - pasted[index - 1].x).toBeCloseTo(24, 5);
    expect(pasted[index].y - pasted[index - 1].y).toBeCloseTo(24, 5);
  }

  // A clipboard that holds no presentation objects is reported, in German, and changes nothing.
  await canvas(page).evaluate((element) => {
    const data = new DataTransfer(); data.setData("text/plain", "nur Text");
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.getByText("Zwischenablage nicht verfügbar", { exact: false })).toBeVisible();
  await expect(texts).toHaveCount(5);
});
