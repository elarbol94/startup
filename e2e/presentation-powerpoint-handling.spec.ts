import { expect, test, type Page } from "@playwright/test";
import { seedPresentation as seed } from "./helpers/presentation-fixture";

/** PowerPoint-style object handling: group drill-in, the Escape ladder, rotated handles, multi-selection scaling, smart duplicate. */
test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);

type Element = { id: string; type: string; x: number; y: number; width: number; height: number; rotation: number; parentId?: string };
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const selected = (page: Page) => page.locator(".react-flow__node.selected");
const canvas = (page: Page) => page.locator("[data-presentation-canvas]");

async function saved(page: Page, id: string): Promise<{ elements: Element[] }> {
  await canvas(page).focus(); await page.keyboard.press("Control+s");
  await expect(page.getByTestId("collaboration-status").getByText("Gespeichert", { exact: true })).toBeVisible();
  return (await page.request.get(`/api/wiki/presentations/${id}`, { maxRetries: 2 })).json();
}
/** The stored deck, without waiting: pair it with `expect.poll` after a gesture, whose write may still be landing. */
async function deck(page: Page, id: string): Promise<{ elements: Element[] }> {
  return (await page.request.get(`/api/wiki/presentations/${id}`, { maxRetries: 2 })).json();
}
const find = (deck: { elements: Element[] }, id: string) => deck.elements.find((element) => element.id === id)!;
const centre = (box: { x: number; y: number; width: number; height: number }) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

async function groupAandB(page: Page) {
  await node(page, "a").click(); await node(page, "b").click({ modifiers: ["Shift"] });
  await canvas(page).focus(); await page.keyboard.press("Control+g");
  await expect(selected(page)).toHaveCount(1);
  const group = await selected(page).getAttribute("data-id");
  expect(group).not.toBe("a");
  return group!;
}

test("a second click drills into a group and Escape steps back out one level at a time", async ({ page }) => {
  await seed(page);
  const group = await groupAandB(page);
  await page.keyboard.press("Escape"); await expect(selected(page)).toHaveCount(0);

  await node(page, "a").click(); await expect(node(page, group)).toHaveClass(/selected/); await expect(node(page, "a")).not.toHaveClass(/selected/);
  await node(page, "a").click(); await expect(node(page, "a")).toHaveClass(/selected/); await expect(selected(page)).toHaveCount(1);
  // Inside the group, a sibling is selected directly.
  await node(page, "b").click(); await expect(node(page, "b")).toHaveClass(/selected/); await expect(selected(page)).toHaveCount(1);

  await canvas(page).focus();
  await page.keyboard.press("Escape"); await expect(node(page, group)).toHaveClass(/selected/); await expect(selected(page)).toHaveCount(1);
  await page.keyboard.press("Escape"); await expect(selected(page)).toHaveCount(0);
});

test("a drilled-in member moves alone; pressing a member of a selected group drags the whole selection", async ({ page }) => {
  const id = await seed(page);
  const group = await groupAandB(page);
  const before = await saved(page, id);

  // Group and the arrow selected together, then dragged by a member of the group.
  await node(page, "line").click({ modifiers: ["Shift"] }); await expect(selected(page)).toHaveCount(2);
  const b = centre((await node(page, "b").boundingBox())!);
  await page.mouse.move(b.x, b.y); await page.mouse.down(); await page.mouse.move(b.x + 60, b.y + 90, { steps: 10 }); await page.mouse.up();
  await expect(selected(page)).toHaveCount(2);
  await saved(page, id);
  // Every selected object moved, the arrow beside the group included.
  await expect.poll(async () => { const now = await deck(page, id); return Math.min(...["a", "b", "line", group].flatMap((element) => [find(now, element).x - find(before, element).x, find(now, element).y - find(before, element).y])); }).toBeGreaterThan(20);
  const moved = await deck(page, id);

  // Drill into the group: now only that member follows the pointer.
  await page.keyboard.press("Escape"); await expect(selected(page)).toHaveCount(0);
  await node(page, "a").click(); await node(page, "a").click(); await expect(node(page, "a")).toHaveClass(/selected/);
  const a = centre((await node(page, "a").boundingBox())!);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(a.x + 50, a.y + 120, { steps: 10 }); await page.mouse.up();
  await saved(page, id);
  await expect.poll(async () => find(await deck(page, id), "a").y - find(moved, "a").y).toBeGreaterThan(40);
  const drilled = await deck(page, id);
  expect(find(drilled, "b")).toMatchObject({ x: find(moved, "b").x, y: find(moved, "b").y });
});

test("a single rotated object keeps its rotate handle on its own rotated top edge", async ({ page }) => {
  await seed(page, false, false, [
    { id: "r", type: "shape", x: 300, y: 300, width: 300, height: 100, rotation: 90, content: { shape: "rect", fill: "#6366f1", stroke: "", strokeWidth: 0, opacity: 1 } },
  ], { steps: [], waitFor: "r" });
  await node(page, "r").click();
  const shape = centre((await node(page, "r").boundingBox())!);
  const handle = centre((await page.getByTestId("presentation-rotate-handle").boundingBox())!);
  // Turned a quarter clockwise, the top edge faces right: the handle is right of the centre, level with it.
  expect(handle.x - shape.x).toBeGreaterThan(40);
  expect(Math.abs(handle.y - shape.y)).toBeLessThan(6);
});

test("several objects get eight scale handles that scale them together without drifting", async ({ page }) => {
  const id = await seed(page);
  await node(page, "a").click(); await node(page, "b").click({ modifiers: ["Shift"] });
  await expect(page.locator("[data-scale-handle]")).toHaveCount(8);
  await expect(page.getByTestId("presentation-selection-outline")).toHaveCount(2);
  const before = await saved(page, id);

  const corner = centre((await page.locator('[data-scale-handle="1,1"]').boundingBox())!);
  await page.mouse.move(corner.x, corner.y); await page.mouse.down();
  // Far past the minimum size and back: absolute factors bring the selection back exactly.
  await page.mouse.move(corner.x - 900, corner.y - 600, { steps: 8 });
  await page.mouse.move(corner.x, corner.y, { steps: 8 });
  await page.mouse.up();
  const restored = await saved(page, id);
  for (const element of ["a", "b"]) {
    expect(Math.abs(find(restored, element).width - find(before, element).width)).toBeLessThan(2);
    expect(Math.abs(find(restored, element).x - find(before, element).x)).toBeLessThan(2);
  }

  const edge = centre((await page.locator('[data-scale-handle="1,0"]').boundingBox())!);
  const zoom = await page.locator(".react-flow__viewport").first().evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  const span = find(before, "b").x + find(before, "b").width - find(before, "a").x;
  await page.mouse.move(edge.x, edge.y); await page.mouse.down(); await page.mouse.move(edge.x + span * zoom, edge.y, { steps: 8 }); await page.mouse.up();
  const doubled = await saved(page, id);
  expect(find(doubled, "a").width / find(before, "a").width).toBeCloseTo(2, 1);
  expect(find(doubled, "a").height).toBeCloseTo(find(before, "a").height, 0);
});

test("Ctrl+D repeats how far the previous copy was moved", async ({ page }) => {
  const id = await seed(page);
  await node(page, "a").click(); await canvas(page).focus();
  await page.keyboard.press("Control+d"); await expect(page.locator(".react-flow__node")).toHaveCount(5);
  const first = (await selected(page).getAttribute("data-id"))!;
  // Moved by dragging (Shift+Arrow resizes, as in PowerPoint).
  const copy = (await node(page, first).boundingBox())!;
  await page.mouse.move(copy.x + copy.width / 2, copy.y + copy.height / 2); await page.mouse.down();
  await page.mouse.move(copy.x + copy.width / 2 + 160, copy.y + copy.height / 2 + 4, { steps: 10 }); await page.mouse.up();
  await canvas(page).focus();
  await page.keyboard.press("Control+d"); await expect(page.locator(".react-flow__node")).toHaveCount(6);
  const second = (await selected(page).getAttribute("data-id"))!;
  const deck = await saved(page, id);
  const step = find(deck, first).x - find(deck, "a").x;
  expect(step).toBeGreaterThan(90);
  expect(find(deck, second).x - find(deck, first).x).toBeCloseTo(step, 0);
  expect(find(deck, second).y - find(deck, first).y).toBeCloseTo(find(deck, first).y - find(deck, "a").y, 0);
});
