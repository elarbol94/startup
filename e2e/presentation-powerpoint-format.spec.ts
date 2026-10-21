import { expect, test, type Page } from "@playwright/test";
import { seedPresentation as seed } from "./helpers/presentation-fixture";

/** PowerPoint's Format pane, ribbon styles, paragraph tools, grid and guides, and shape tools. */
test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);

type Content = Record<string, unknown> & { fillStyle?: { type: string }; effects?: { shadow?: { type: string } }; paragraphs?: { bullet?: { kind: string; char?: string }; level?: number }[]; freeform?: unknown; fill?: string };
type Element = { id: string; type: string; content: Content };
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const canvas = (page: Page) => page.locator("[data-presentation-canvas]");
const preset = (id: string, x: number, y: number) => ({ id, type: "shape", x, y, width: 200, height: 120, rotation: 0, content: { shape: "rect", preset: "rect", fill: "#156082", stroke: "#042433", strokeWidth: 1.5, opacity: 1 } });

async function save(page: Page) {
  await canvas(page).focus(); await page.keyboard.press("Control+s");
  await expect(page.getByTestId("collaboration-status").getByText("Gespeichert", { exact: true })).toBeVisible();
}
async function deck(page: Page, id: string): Promise<{ elements: Element[]; settings: { grid: { show: boolean }; guides: { show: boolean; list: unknown[] }; ruler: boolean; defaults: { shape?: { fill?: string } } } }> {
  return (await page.request.get(`/api/wiki/presentations/${id}`, { maxRetries: 2 })).json();
}
const find = (elements: Element[], id: string) => elements.find((element) => element.id === id)!;

test("Quick Styles and the Format pane give a shape PowerPoint's gradient, shadow and pattern fills", async ({ page }) => {
  const id = await seed(page, false, false, [preset("a", 0, 0)], { steps: [], waitFor: "a" });
  await node(page, "a").click();
  await page.getByRole("tab", { name: "Formformat", exact: true }).click();
  await expect(page.getByTestId("presentation-format-ribbon")).toBeVisible();
  await page.getByTestId("quick-styles-button").click();
  // "Intensiver Effekt – Orange, Akzent 2": the gradient with an outer shadow, read back from PowerPoint.
  await page.getByTestId("quick-style-intenseEffect-accent2").click();
  await expect(node(page, "a").locator("linearGradient")).toHaveCount(1);
  await expect(node(page, "a").locator("filter feGaussianBlur").first()).toBeAttached();
  await save(page);
  await expect.poll(async () => find((await deck(page, id)).elements, "a").content).toMatchObject({ fillStyle: { type: "gradient" }, effects: { shadow: { type: "outer" } }, strokeWidth: 0 });

  await page.getByTestId("format-pane-button").click();
  const pane = page.getByTestId("format-shape-pane");
  await expect(pane).toBeVisible();
  await pane.getByRole("radio", { name: "Musterfüllung" }).check();
  await pane.getByTestId("format-patterns").getByRole("option", { name: "Zickzack" }).click();
  await expect(node(page, "a").locator("pattern")).toHaveCount(1);
  await pane.getByTestId("format-line-dash").selectOption("longDashDot");
  await save(page);
  await expect.poll(async () => find((await deck(page, id)).elements, "a").content).toMatchObject({ fillStyle: { type: "pattern", pattern: "zigZag" }, dash: "longDashDot" });
});

test("bullets, list levels and superscript work like PowerPoint's Home tab and keys", async ({ page }) => {
  const id = await seed(page, false, false, [{ id: "t", type: "text", x: 0, y: 0, width: 400, height: 200, rotation: 0, content: { text: "One\nTwo", fontSize: 24, bold: false, align: "left", color: "#000000" } }], { steps: [], waitFor: "t" });
  await node(page, "t").click();
  await page.getByTestId("bullets-button").click();
  await page.getByTestId("bullet-filledRound").click();
  await expect(node(page, "t").getByText("•")).toHaveCount(2);
  await save(page);
  await expect.poll(async () => find((await deck(page, id)).elements, "t").content.paragraphs?.map((p) => p.bullet?.char)).toEqual(["•", "•"]);

  // Tab at the start of a list paragraph demotes it (PowerPoint). Deselect first, so the
  // double-click enters editing directly rather than placing a caret a moment later.
  await canvas(page).focus(); await page.keyboard.press("Escape");
  await node(page, "t").dblclick();
  const editor = node(page, "t").locator('[contenteditable="true"]');
  await expect(editor).toBeFocused();
  await page.keyboard.press("Control+End"); await page.keyboard.press("Home"); await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  await save(page);
  await expect.poll(async () => find((await deck(page, id)).elements, "t").content.paragraphs?.[1]?.level).toBe(1);

  // Escape left the box selected (not editing): the button formats all of its text.
  await expect(node(page, "t").locator('[contenteditable="true"]')).toHaveCount(0);
  await page.getByTestId("superscript-button").click();
  await save(page);
  await expect.poll(async () => (find((await deck(page, id)).elements, "t").content.runs as { text: string; baseline?: number }[] | undefined)?.every((run) => run.text === "\n" || run.baseline === 30)).toBe(true);
});

test("Shift+F9 shows the grid, Alt+F9 the centre guides, and the View menu the rulers", async ({ page }) => {
  const id = await seed(page, false, false, [{ id: "frame", type: "frame", x: 0, y: 0, width: 960, height: 540, rotation: 0, content: { label: "", shape: "rect", color: "" } }], { steps: [], waitFor: "frame" });
  await canvas(page).focus();
  await page.keyboard.press("Shift+F9");
  await expect(page.locator("#presentation-grid, [data-testid=rf__background] #pattern-presentation-grid, svg pattern[id*='presentation-grid']").first()).toBeAttached();
  await page.keyboard.press("Alt+F9");
  await expect(page.getByTestId("presentation-guide")).toHaveCount(2);
  await page.getByTestId("presentation-view-menu").click();
  await page.getByTestId("view-ruler").click();
  await expect(page.getByTestId("presentation-ruler-horizontal")).toBeVisible();
  await expect(page.getByTestId("presentation-ruler-vertical")).toBeVisible();
  await save(page);
  await expect.poll(async () => { const s = (await deck(page, id)).settings; return [s.grid.show, s.guides.show, s.guides.list.length, s.ruler]; }).toEqual([true, true, 2, true]);
});

test("Merge Shapes unites two overlapping shapes into one freeform with the first shape's format", async ({ page }) => {
  const second = { ...preset("b", 100, 60), content: { ...preset("b", 0, 0).content, fill: "#E97132" } };
  const id = await seed(page, false, false, [preset("a", 0, 0), second], { steps: [], waitFor: "a" });
  // Click where only that shape is: the second one covers the first's centre.
  await node(page, "a").click({ position: { x: 20, y: 20 } });
  await node(page, "b").click({ modifiers: ["Shift"], position: { x: 180, y: 100 } });
  await page.getByRole("tab", { name: "Formformat", exact: true }).click();
  await page.getByTestId("merge-shapes-button").click();
  await page.getByTestId("merge-union").click();
  await expect(page.locator(".react-flow__node-shape")).toHaveCount(1);
  await save(page);
  await expect.poll(async () => { const elements = (await deck(page, id)).elements; return [elements.length, Boolean(elements[0].content.freeform), elements[0].content.fill]; }).toEqual([1, true, "#156082"]);
});

test("Lock Drawing Mode keeps the tool armed, Set as Default Shape formats the next shape, Edit Points shows vertices", async ({ page }) => {
  const id = await seed(page, false, false, [{ ...preset("a", -600, -400), content: { ...preset("a", 0, 0).content, fill: "#A02B93" } }], { steps: [], waitFor: "a" });
  // Set as Default Shape from the context menu.
  await node(page, "a").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Als Standardform festlegen" }).click();
  await save(page);
  await expect.poll(async () => (await deck(page, id)).settings.defaults.shape?.fill).toBe("#A02B93");

  // Lock Drawing Mode: right-click the gallery entry, then draw twice.
  await page.getByTestId("presentation-shapes-button").click();
  await page.getByTestId("presentation-shape-gallery").getByRole("button", { name: "Ellipse", exact: true }).first().click({ button: "right" });
  await page.getByTestId("lock-drawing-mode").click();
  const layer = page.getByTestId("presentation-draw-layer");
  await expect(layer).toBeVisible();
  const box = (await layer.boundingBox())!;
  for (const dx of [0, 250]) { await page.mouse.click(box.x + box.width / 2 + dx, box.y + box.height / 2); }
  await expect(layer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(layer).toHaveCount(0);
  await save(page);
  await expect.poll(async () => (await deck(page, id)).elements.filter((e) => e.content.preset === "ellipse").map((e) => e.content.fill)).toEqual(["#A02B93", "#A02B93"]);

  await node(page, "a").click();
  await page.getByRole("tab", { name: "Formformat", exact: true }).click();
  await page.getByTestId("edit-points-button").click();
  await expect(page.getByTestId("presentation-edit-points")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("presentation-edit-points")).toHaveCount(0);
  await save(page);
  await expect.poll(async () => Boolean(find((await deck(page, id)).elements, "a").content.freeform)).toBe(true);
});
