import { expect, test, type Page } from "@playwright/test";
import { drawShape, seedPresentation as seed, openPane } from "./helpers/presentation-fixture";

/** PowerPoint-style shapes and connectors: the larger gallery, adjustment handles, glued and routed lines. */
test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);

type Element = { id: string; type: string; x: number; y: number; width: number; content: Record<string, unknown> & { connection?: { fromId?: string; toId?: string; fromSite?: string; toSite?: string }; route?: string; points?: unknown[]; adjust?: number; shape?: string } };
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const canvas = (page: Page) => page.locator("[data-presentation-canvas]");
const rect = (id: string, x: number, y: number) => ({ id, type: "shape", x, y, width: 200, height: 120, rotation: 0, content: { shape: "rect", fill: "#e0e7ff", stroke: "#6366f1", strokeWidth: 2, opacity: 1 } });
const arrow = { id: "line", type: "shape", x: 300, y: 500, width: 300, height: 20, rotation: 0, content: { shape: "arrow", fill: "", stroke: "#334155", strokeWidth: 3, opacity: 1 } };

async function save(page: Page) {
  await canvas(page).focus(); await page.keyboard.press("Control+s");
  await expect(page.getByTestId("collaboration-status").getByText("Gespeichert", { exact: true })).toBeVisible();
}
async function deck(page: Page, id: string): Promise<{ elements: Element[] }> {
  return (await page.request.get(`/api/wiki/presentations/${id}`, { maxRetries: 2 })).json();
}
const find = (elements: Element[], id: string) => elements.find((element) => element.id === id)!;
const centre = (box: { x: number; y: number; width: number; height: number }) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 12 }); await page.mouse.up();
}

test("the gallery's preset star has PowerPoint's yellow handle, which adjusts its inner radius", async ({ page }) => {
  const id = await seed(page, false, false, [rect("a", 0, 0)], { steps: [], waitFor: "a" });
  await drawShape(page, "Stern: 5 Zacken");
  const star = page.locator(".react-flow__node-shape:not([data-id=\"a\"])");
  await expect(star).toHaveCount(1);
  const starId = (await star.getAttribute("data-id"))!;
  await expect(page.getByTestId("presentation-adjust-handle")).toHaveCount(1);
  const handle = page.getByTestId("presentation-adjust-handle");
  const before = centre((await handle.boundingBox())!);
  const shape = centre((await node(page, starId).boundingBox())!);
  // Towards the centre: a thinner star (DrawingML adj below the default 19098).
  await drag(page, before, { x: before.x, y: before.y + (shape.y - before.y) * 0.6 });
  await save(page);
  await expect.poll(async () => (find((await deck(page, id)).elements, starId).content as { preset?: string; adjustments?: { adj?: number } })).toMatchObject({ preset: "star5" });
  await expect.poll(async () => (find((await deck(page, id)).elements, starId).content as { adjustments?: { adj?: number } }).adjustments?.adj ?? 19098).toBeLessThan(12000);
});

test("line ends glue to connection sites, follow their shapes, route as elbows and come loose on empty canvas", async ({ page }) => {
  const id = await seed(page, false, false, [rect("a", 0, 0), rect("b", 700, 300), arrow], { steps: [], waitFor: "line" });
  await node(page, "line").click();
  const start = page.locator('[data-line-end="0"]'), end = page.locator('[data-line-end="1"]');
  await expect(start).toBeVisible();

  // Start onto the right side of a, end onto the left side of b.
  const a = (await node(page, "a").boundingBox())!, b = (await node(page, "b").boundingBox())!;
  await drag(page, centre((await start.boundingBox())!), { x: a.x + a.width - 6, y: a.y + a.height / 2 });
  await expect(start).toHaveAttribute("data-glued", "true");
  await drag(page, centre((await end.boundingBox())!), { x: b.x + 6, y: b.y + b.height / 2 });
  await expect(end).toHaveAttribute("data-glued", "true");
  await save(page);
  await expect.poll(async () => find((await deck(page, id)).elements, "line").content.connection).toMatchObject({ fromId: "a", fromSite: "right", toId: "b", toSite: "left" });

  // Moving b drags the glued end with it.
  const glued = find((await deck(page, id)).elements, "line");
  await drag(page, centre(b), { x: centre(b).x, y: centre(b).y + 120 });
  await save(page);
  await expect.poll(async () => JSON.stringify(find((await deck(page, id)).elements, "line"))).not.toBe(JSON.stringify(glued));

  // Elbow routing from the inspector.
  await node(page, "line").click();
  await openPane(page, "Eigenschaften");
  await page.getByTestId("presentation-line-route").selectOption("elbow");
  await save(page);
  await expect.poll(async () => { const line = find((await deck(page, id)).elements, "line"); return [line.content.route, (line.content.points ?? []).length >= 3]; }).toEqual(["elbow", true]);

  // Dropping the start on empty canvas frees it; the end stays glued.
  await page.getByRole("button", { name: "Seitenbereich schließen" }).click();
  const box = (await canvas(page).boundingBox())!;
  await drag(page, centre((await start.boundingBox())!), { x: box.x + 60, y: box.y + box.height - 120 });
  await save(page);
  await expect.poll(async () => { const connection = find((await deck(page, id)).elements, "line").content.connection; return [connection?.fromId ?? null, connection?.toId]; }).toEqual([null, "b"]);
});
