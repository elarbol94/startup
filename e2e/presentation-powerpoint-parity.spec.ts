import { expect, test, type Page } from "@playwright/test";
import { drawShape, seedPresentation as seed } from "./helpers/presentation-fixture";

/** Working on the canvas like on a PowerPoint slide: gallery, drawing, connectors and keys. */
test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);

type Element = { id: string; type: string; x: number; y: number; width: number; height: number; rotation: number; content: Record<string, unknown> & { preset?: string; connection?: { fromId?: string; toId?: string }; freeform?: { closed: boolean } } };
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const canvas = (page: Page) => page.locator("[data-presentation-canvas]");
/** A slide-sized frame, so fitting the view keeps the canvas points the tests use on screen. */
const slide = { id: "slide", type: "frame", x: 0, y: 0, width: 960, height: 540, rotation: 0, content: { label: "Slide", shape: "rect", color: "" } };
const box = (id: string, x: number, y: number) => ({ id, type: "shape", x, y, width: 200, height: 120, rotation: 0, content: { shape: "rect", preset: "rect", fill: "#156082", stroke: "#042433", strokeWidth: 1.5, opacity: 1, text: "Alpha", fontSize: 18 } });

async function save(page: Page) {
  await canvas(page).focus(); await page.keyboard.press("Control+s");
  await expect(page.getByTestId("collaboration-status").getByText("Gespeichert", { exact: true })).toBeVisible();
}
async function deck(page: Page, id: string): Promise<{ elements: Element[] }> {
  return (await page.request.get(`/api/wiki/presentations/${id}`, { maxRetries: 2 })).json();
}
async function flow(page: Page, point: { x: number; y: number }) {
  return page.locator(".react-flow__viewport").first().evaluate((el, p) => {
    const m = new DOMMatrix(getComputedStyle(el).transform), parent = el.parentElement!.getBoundingClientRect();
    return { x: parent.left + m.e + p.x * m.a, y: parent.top + m.f + p.y * m.a, zoom: m.a };
  }, point);
}
const added = (before: Element[], after: Element[]) => after.filter((element) => !before.some((other) => other.id === element.id));

test("the gallery lists PowerPoint's categories and shapes; a click inserts the default size, a drag spans the box", async ({ page }) => {
  const id = await seed(page, false, false, [slide, box("a", 0, 0)], { steps: [], waitFor: "a" });
  await page.getByTestId("presentation-shapes-button").click();
  const gallery = page.getByTestId("presentation-shape-gallery");
  for (const category of ["Standardformen", "Linien", "Pfeile", "Legenden", "Symbole", "Flussdiagramm", "Sterne und Banner", "Schaltflächen"]) await expect(gallery.getByRole("region", { name: category })).toBeVisible();
  await expect(gallery.locator("[data-shape-entry]")).toHaveCount(172);
  await page.keyboard.press("Escape");

  const before = (await deck(page, id)).elements;
  const at = await flow(page, { x: 400, y: 300 });
  await drawShape(page, "Pfeil: nach rechts", at);
  await save(page);
  await expect.poll(async () => added(before, (await deck(page, id)).elements).map((element) => [element.content.preset, Math.round(element.x), Math.round(element.y), element.width, element.height]))
    .toEqual([["rightArrow", 400, 300, 77.04, 38.16]]);

  const middle = (await deck(page, id)).elements;
  const start = await flow(page, { x: 600, y: 100 }), end = await flow(page, { x: 750, y: 180 });
  await drawShape(page, "Flussdiagramm: Verzweigung", start, end);
  await save(page);
  await expect.poll(async () => added(middle, (await deck(page, id)).elements).map((element) => [element.content.preset, Math.round(element.x), Math.round(element.y), Math.round(element.width), Math.round(element.height)]))
    .toEqual([["flowChartDecision", 600, 100, 150, 80]]);
  // The new shape is selected and shows PowerPoint's default style.
  await expect(page.locator(".react-flow__node.selected")).toHaveCount(1);
});

test("an elbow connector drawn from one shape to another is glued at both ends", async ({ page }) => {
  const id = await seed(page, false, false, [slide, box("a", 0, 0), box("b", 500, 300)], { steps: [], waitFor: "b" });
  const from = await flow(page, { x: 195, y: 60 }), to = await flow(page, { x: 505, y: 360 });
  await drawShape(page, "Verbinder: gewinkelt mit Pfeil", from, to);
  await save(page);
  await expect.poll(async () => {
    const line = (await deck(page, id)).elements.find((element) => element.content.connection);
    return [line?.content.connection?.fromId, line?.content.connection?.toId, line?.content.route];
  }).toEqual(["a", "b", "elbow"]);
});

test("scribble draws freehand and freeform closes on its first point", async ({ page }) => {
  const id = await seed(page, false, false, [slide, box("a", 0, 0)], { steps: [], waitFor: "a" });
  await page.getByTestId("presentation-shapes-button").click();
  await page.getByTestId("presentation-shape-gallery").getByRole("button", { name: "Freihandform: Skizze", exact: true }).first().click();
  const p = await flow(page, { x: 400, y: 300 });
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(p.x + i * 12, p.y + (i % 2 ? 20 : -20));
  await page.mouse.up();

  await page.getByTestId("presentation-shapes-button").click();
  await page.getByTestId("presentation-shape-gallery").getByRole("button", { name: "Freihandform: Form", exact: true }).first().click();
  const corners = [await flow(page, { x: 600, y: 300 }), await flow(page, { x: 700, y: 300 }), await flow(page, { x: 650, y: 380 })];
  for (const corner of corners) await page.mouse.click(corner.x, corner.y);
  await page.mouse.click(corners[0].x + 2, corners[0].y + 2);
  await save(page);
  await expect.poll(async () => (await deck(page, id)).elements.filter((element) => element.content.freeform).map((element) => element.content.freeform!.closed).sort())
    .toEqual([false, true]);
});

test("PowerPoint's keys: nudge, Shift resize around the centre, Alt rotate, Ctrl+B, Ctrl+Shift+>, F2 and typing", async ({ page }) => {
  const id = await seed(page, false, false, [slide, box("a", 400, 200)], { steps: [], waitFor: "a" });
  await node(page, "a").click(); await canvas(page).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Alt+ArrowRight");
  await page.keyboard.press("Control+b");
  await page.keyboard.press("Control+Shift+Period");
  await save(page);
  await expect.poll(async () => {
    const a = (await deck(page, id)).elements.find((element) => element.id === "a")!;
    return [Math.round(a.x * 100) / 100, Math.round(a.width * 100) / 100, a.rotation, a.content.bold, a.content.fontSize];
  }).toEqual([390.72, 220, 15, true, 20]);
  // Typing on the selected shape adds to its text; F2 then leaves editing.
  await page.keyboard.type("Z");
  await expect(node(page, "a").locator(".ProseMirror")).toBeFocused();
  await page.keyboard.press("F2");
  await save(page);
  await expect.poll(async () => (await deck(page, id)).elements.find((element) => element.id === "a")!.content.text).toBe("AlphaZ");
});
