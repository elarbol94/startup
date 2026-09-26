import { expect, test, type Page } from "@playwright/test";
import { placeAtCenter, seedPresentation } from "./helpers/presentation-fixture";

/** Frames as containers and stops: membership, naming, the path, placement and presenting. */
test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);

type Element = { id: string; type: string; x: number; y: number; width: number; height: number; parentId?: string; content: { label?: string } };
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const frames = (page: Page) => page.locator(".react-flow__node-frame");
const canvas = (page: Page) => page.locator("[data-presentation-canvas]");
const frame = (id: string, x: number, y: number, label: string) => ({ id, type: "frame", x, y, width: 960, height: 540, rotation: 0, content: { label, shape: "rect", color: "" } });
const text = (id: string, x: number, y: number, parentId?: string) => ({ id, type: "text", x, y, width: 260, height: 80, rotation: 0, ...(parentId ? { parentId } : {}), content: { text: `Text ${id}`, fontSize: 32, bold: false, align: "left", color: "" } });

async function saved(page: Page, id: string): Promise<{ elements: Element[]; steps: { elementId: string }[] }> {
  await canvas(page).focus(); await page.keyboard.press("Control+s");
  await expect(page.getByTestId("collaboration-status").getByText("Gespeichert", { exact: true })).toBeVisible();
  return (await page.request.get(`/api/wiki/presentations/${id}`, { maxRetries: 2 })).json();
}
async function viewport(page: Page) {
  return page.locator(".react-flow__viewport").first().evaluate((el) => { const m = new DOMMatrix(getComputedStyle(el).transform); return { zoom: m.a, x: m.e, y: m.f }; });
}
async function box(page: Page, id: string) { return (await node(page, id).boundingBox())!; }
/** Frames are grabbed by their outline (a thin hit area when zoomed out); their interior belongs to the canvas. */
async function dragFrameBy(page: Page, id: string, dx: number, dy: number) {
  const b = await box(page, id);
  await page.mouse.move(b.x + 1, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + 1 + dx, b.y + b.height / 2 + dy, { steps: 12 }); await page.mouse.up();
}
async function addFrameAtCenter(page: Page) {
  await page.getByRole("button", { name: "Rahmen", exact: true }).click();
  await placeAtCenter(page);
}
async function pathPanel(page: Page) {
  const button = page.getByRole("button", { name: "Weg", exact: true });
  if (await button.getAttribute("aria-expanded") !== "true") await button.click();
}

test("a text placed in a new frame moves with it, and one undo restores both", async ({ page }) => {
  const id = await seedPresentation(page, false, false, [], { steps: [], waitFor: null });
  await addFrameAtCenter(page);
  await expect(frames(page)).toHaveCount(1);
  const frameId = (await frames(page).getAttribute("data-id"))!;
  await expect(node(page, frameId)).toContainText("Rahmen 1");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await placeAtCenter(page);
  const textId = (await page.locator(".react-flow__node-text").getAttribute("data-id"))!;
  await expect.poll(async () => {
    const data = await saved(page, id);
    const created = data.elements.find((e) => e.id === frameId);
    return [created?.width, created?.height, created?.content.label, data.elements.find((e) => e.id === textId)?.parentId, data.steps.map((step) => step.elementId)];
  }).toEqual([960, 540, "Rahmen 1", frameId, [frameId]]);

  await page.keyboard.press("Escape");
  const frameBefore = await box(page, frameId), textBefore = await box(page, textId), view = await viewport(page);
  await dragFrameBy(page, frameId, 180, 90);
  expect(await viewport(page)).toEqual(view);
  const frameAfter = await box(page, frameId), textAfter = await box(page, textId);
  expect(frameAfter.x - frameBefore.x).toBeGreaterThan(100);
  expect(textAfter.x - frameAfter.x).toBeCloseTo(textBefore.x - frameBefore.x, 0);
  expect(textAfter.y - frameAfter.y).toBeCloseTo(textBefore.y - frameBefore.y, 0);

  await canvas(page).focus(); await page.keyboard.press("Control+z");
  await expect.poll(async () => Math.round((await box(page, frameId)).x)).toBe(Math.round(frameBefore.x));
  expect((await box(page, textId)).x).toBeCloseTo(textBefore.x, 0);
  expect((await box(page, textId)).y).toBeCloseTo(textBefore.y, 0);
  await expect.poll(async () => (await saved(page, id)).elements.find((e) => e.id === textId)?.parentId).toBe(frameId);
});

test("a text added to a template frame moves with that frame", async ({ page }) => {
  await seedPresentation(page, false, false, [], { steps: [], waitFor: null });
  await page.goto("/wiki/presentations");
  await page.getByRole("button", { name: "Neu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Leer oder aus Vorlage", exact: true }).click();
  await page.getByRole("textbox", { name: "Titel der Präsentation" }).fill(`Frames ${Date.now()}`);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Pitch", exact: true }).click();
  await dialog.getByRole("button", { name: "Vorlage verwenden", exact: true }).click();
  await page.waitForURL(/\/wiki\/presentations\/[^/]+$/, { timeout: 30_000 });
  const cover = frames(page).first();
  await expect(cover).toBeVisible();
  const coverId = (await cover.getAttribute("data-id"))!;
  const b = await box(page, coverId);
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await expect(page.getByTestId("presentation-placement-preview")).toBeAttached();
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.8);
  await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.8);
  await expect(page.getByTestId("presentation-placement-preview")).toHaveCount(0);
  const textId = (await page.locator(".react-flow__node.selected").getAttribute("data-id"))!;
  await page.keyboard.press("Escape");
  const frameBefore = await box(page, coverId), textBefore = await box(page, textId), view = await viewport(page);
  await dragFrameBy(page, coverId, 120, 60);
  expect(await viewport(page)).toEqual(view);
  const frameAfter = await box(page, coverId), textAfter = await box(page, textId);
  expect(Math.abs(frameAfter.x - frameBefore.x)).toBeGreaterThan(60);
  expect(textAfter.x - frameAfter.x).toBeCloseTo(textBefore.x - frameBefore.x, 0);
  expect(textAfter.y - frameAfter.y).toBeCloseTo(textBefore.y - frameBefore.y, 0);
  await canvas(page).focus(); await page.keyboard.press("Control+z");
  await expect.poll(async () => Math.round((await box(page, coverId)).x)).toBe(Math.round(frameBefore.x));
  expect((await box(page, textId)).x).toBeCloseTo(textBefore.x, 0);
});

test("deleting a frame keeps its members and its stop comes back with undo", async ({ page }) => {
  const id = await seedPresentation(page, false, false, [frame("f", 0, 0, "Rahmen 1"), text("t", 200, 200, "f")], { steps: [{ id: "s1", elementId: "f" }], waitFor: "t" });
  await pathPanel(page);
  await expect(page.getByRole("button", { name: "Rahmen 1", exact: true })).toBeVisible();
  const b = await box(page, "f");
  await page.mouse.click(b.x + 2, b.y + b.height / 2);
  await expect(node(page, "f")).toHaveClass(/selected/);
  await page.keyboard.press("Delete");
  await expect(node(page, "f")).toHaveCount(0);
  await expect(node(page, "t")).toBeVisible();
  await expect(page.getByRole("button", { name: "Rahmen 1", exact: true })).toHaveCount(0);
  await expect.poll(async () => { const data = await saved(page, id); return [data.elements.map((e) => [e.id, e.parentId ?? null]), data.steps.length]; }).toEqual([[["t", null]], 0]);
  await canvas(page).focus(); await page.keyboard.press("Control+z");
  await expect(node(page, "f")).toBeVisible();
  await expect(page.getByRole("button", { name: "Rahmen 1", exact: true })).toBeVisible();
  await expect.poll(async () => { const t = (await saved(page, id)).elements.find((e) => e.id === "t"); return [t?.parentId, t?.x, t?.y]; }).toEqual(["f", 200, 200]);
});

test("new frames become named stops, never land on each other, and undo removes one at a time", async ({ page }) => {
  await seedPresentation(page, false, false, [], { steps: [], waitFor: null });
  await pathPanel(page);
  await addFrameAtCenter(page);
  const before = await viewport(page);
  await addFrameAtCenter(page);
  await expect(frames(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Rahmen 1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rahmen 2", exact: true })).toBeVisible();
  const [first, second] = [(await frames(page).nth(0).boundingBox())!, (await frames(page).nth(1).boundingBox())!];
  expect(second.x).toBeGreaterThanOrEqual(first.x + first.width);
  await expect.poll(async () => (await viewport(page)).zoom).toBeCloseTo(before.zoom, 5);
  await canvas(page).focus(); await page.keyboard.press("Control+z");
  await expect(frames(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Rahmen 2", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rahmen 1", exact: true })).toBeVisible();
});

test("frames from Einfügen and duplicates become stops in one undo step each", async ({ page }) => {
  const id = await seedPresentation(page, false, false, [], { steps: [], waitFor: null });
  await page.getByRole("button", { name: "Einfügen", exact: true }).click();
  await page.getByRole("menuitem", { name: "Rahmen", exact: true }).click();
  await placeAtCenter(page);
  await expect(frames(page)).toHaveCount(1);
  const stops = async () => (await saved(page, id)).steps.length;
  await expect.poll(stops).toBe(1);
  const b = (await frames(page).first().boundingBox())!;
  await page.mouse.click(b.x + 2, b.y + b.height / 2);
  await expect(frames(page).first()).toHaveClass(/selected/);
  await page.keyboard.press("Control+d");
  await expect(frames(page)).toHaveCount(2);
  await expect.poll(stops).toBe(2);
  await canvas(page).focus(); await page.keyboard.press("Control+z");
  await expect(frames(page)).toHaveCount(1);
  await expect.poll(stops).toBe(1);
});

test("dragging over a frame highlights it and the drop joins or leaves it", async ({ page }) => {
  const id = await seedPresentation(page, false, false, [frame("f", 0, 0, "Rahmen 1"), text("t", 1300, 200)], { steps: [{ id: "s1", elementId: "f" }], waitFor: "t" });
  const target = page.locator('.react-flow__node[data-id="f"] [data-drop-target="true"]');
  const f = await box(page, "f"), t = await box(page, "t");
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2); await page.mouse.down();
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2, { steps: 15 });
  await expect(target).toHaveCount(1);
  await page.mouse.up();
  await expect(target).toHaveCount(0);
  await expect.poll(async () => (await saved(page, id)).elements.find((e) => e.id === "t")?.parentId).toBe("f");
  const inside = await box(page, "t");
  await page.mouse.move(inside.x + inside.width / 2, inside.y + inside.height / 2); await page.mouse.down();
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 15 });
  await expect(target).toHaveCount(0);
  await page.mouse.up();
  await expect.poll(async () => (await saved(page, id)).elements.find((e) => e.id === "t")?.parentId ?? null).toBeNull();
});

test("placing a frame by click in an empty deck keeps the zoom", async ({ page }) => {
  await seedPresentation(page, false, false, [], { steps: [], waitFor: null });
  const before = await viewport(page);
  await page.getByRole("button", { name: "Rahmen", exact: true }).click();
  const c = (await canvas(page).boundingBox())!;
  await page.mouse.move(c.x + c.width * 0.45, c.y + c.height * 0.5);
  await page.mouse.click(c.x + c.width * 0.45, c.y + c.height * 0.5);
  await expect(frames(page)).toHaveCount(1);
  await page.waitForTimeout(1000);
  expect(await viewport(page)).toEqual(before);
});

test("frame size presets keep the width and undo in one step", async ({ page }) => {
  const id = await seedPresentation(page, false, false, [frame("f", 0, 0, "Rahmen 1")], { steps: [{ id: "s1", elementId: "f" }], waitFor: "f" });
  const b = await box(page, "f");
  await page.mouse.click(b.x + 2, b.y + b.height / 2);
  await page.getByRole("button", { name: "Werkzeuge", exact: true }).click();
  await page.getByRole("menuitem", { name: "Eigenschaften", exact: true }).click();
  await page.getByRole("button", { name: "Seitenverhältnis 4:3", exact: true }).click();
  const size = async () => { const f = (await saved(page, id)).elements[0]; return [f.width, f.height]; };
  await expect.poll(size).toEqual([960, 720]);
  await page.getByRole("button", { name: "Seitenverhältnis 1:1", exact: true }).click();
  await expect.poll(size).toEqual([960, 960]);
  await canvas(page).focus(); await page.keyboard.press("Control+z");
  await expect.poll(size).toEqual([960, 720]);
});

test("presenting opens on stop 1 with the control bar clear of it", async ({ page }) => {
  const id = await seedPresentation(page, false, false, [frame("f1", 0, 0, "Rahmen 1"), frame("f2", 3000, 2000, "Rahmen 2")], { steps: [{ id: "s1", elementId: "f1" }, { id: "s2", elementId: "f2" }], waitFor: "f1" });
  // Leaving the editor may ask to confirm unsaved changes; this test is about the player.
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto(`/wiki/presentations/${id}/present`);
  const player = page.getByTestId("presentation-player");
  await expect(player.getByRole("status")).toHaveText("1 / 2");
  const controls = (await page.getByTestId("presentation-controls").locator("> div").boundingBox())!;
  const { width } = page.viewportSize()!;
  await expect.poll(async () => {
    const { zoom, x, y } = await viewport(page);
    const left = x, top = y, right = x + 960 * zoom, bottom = y + 540 * zoom;
    const fits = left >= 0 && top >= 0 && right <= width && bottom <= controls.y;
    // Fitted to the stop, not the overview of both frames: it spans most of the width.
    return fits && right - left > width * 0.6;
  }).toBe(true);
});
