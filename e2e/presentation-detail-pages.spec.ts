import { expect, test, type Page } from "@playwright/test";
import { seedPresentation as seed } from "./helpers/presentation-fixture";

/** Detail pages: a box opens a page of its own, which the player turns over to like a card. */
test.use({ viewport: { width: 1440, height: 1000 } });
test.setTimeout(180_000);

type Element = { id: string; type: string; detailId?: string; content: { label?: string } };
const shape = (id: string, y: number, text: string) => ({ id, type: "shape", parentId: "frame", x: 120, y, width: 300, height: 140, rotation: 0,
  content: { shape: "roundedRect", fill: "", stroke: "#172033", strokeWidth: 2, opacity: 1, text } });
const elements = [
  { id: "frame", type: "frame", x: 0, y: 0, width: 1000, height: 650, rotation: 0, content: { label: "Einwohnerinnen", shape: "rect", color: "" } },
  shape("start", 60, "Startseite"), shape("lend", 260, "Gegenstands-\nverleih"), shape("ride", 460, "Mitfahrbörse"),
];
const canvas = (page: Page) => page.locator("[data-presentation-canvas]");
async function deck(page: Page, id: string): Promise<{ elements: Element[]; steps: { elementId: string }[] }> {
  return (await page.request.get(`/api/wiki/presentations/${id}`, { maxRetries: 2 })).json();
}

test("a box gets a detail page in the editor and flips open to it while presenting", async ({ page }) => {
  const id = await seed(page, false, false, elements, { waitFor: "lend" });

  // Selecting a box offers a detail page; one click creates it and opens it.
  await page.locator('.react-flow__node[data-id="lend"]').click();
  await page.locator('[data-detail-badge="create"][data-element-id="lend"]').click();
  const bar = page.getByTestId("detail-scene-bar");
  await expect(bar).toContainText("Übersicht");
  await expect(bar).toContainText("Gegenstandsverleih");
  // Only the page is drawn now; the overview's boxes are out of the way.
  await expect(page.locator('.react-flow__node[data-id="start"]')).toHaveCount(0);

  await canvas(page).focus();
  await page.keyboard.press("Escape");
  await expect(bar).toHaveCount(0);
  await expect(page.locator('.react-flow__node[data-id="start"]')).toBeVisible();
  await expect(page.locator('[data-detail-badge="open"][data-element-id="lend"]')).toBeVisible();

  await canvas(page).focus(); await page.keyboard.press("Control+s");
  await expect(page.getByTestId("collaboration-status").getByText("Gespeichert", { exact: true })).toBeVisible();
  let pageId = "";
  await expect.poll(async () => {
    const saved = await deck(page, id);
    pageId = saved.elements.find((element) => element.id === "lend")?.detailId ?? "";
    const frame = saved.elements.find((element) => element.id === pageId);
    return [frame?.type, frame?.content.label, saved.steps.some((step) => step.elementId === pageId)];
  }).toEqual(["frame", "Gegenstandsverleih", true]);

  // Presenting: the overview path skips the page; clicking the box turns it over.
  await page.goto(`/wiki/presentations/${id}/present`);
  const player = page.getByTestId("presentation-player");
  await expect(player).toHaveAttribute("data-scene", "overview");
  await expect(page.getByRole("status").filter({ hasText: "/" })).toHaveText("1 / 1");
  await page.locator('.react-flow__node[data-id="lend"]').click();
  await expect(player).toHaveAttribute("data-scene", pageId);
  await expect(page.locator("[data-detail-flip]")).toHaveCount(0);
  await expect(page.getByTestId("presentation-detail-back")).toContainText("Gegenstandsverleih");

  // Past the page's last stop the card turns back, and the box is marked as shown.
  await page.keyboard.press("ArrowRight");
  await expect(player).toHaveAttribute("data-scene", "overview");
  await expect(page.locator('[data-detail-badge="visited"][data-element-id="lend"]')).toBeVisible();
  // Input during a turn is dropped; the next click comes once the card has landed.
  await expect(page.locator("[data-detail-flip]")).toHaveCount(0);

  // Escape leaves a page first and only then the presentation.
  await page.locator('[data-detail-badge="visited"][data-element-id="lend"]').click();
  await expect(player).toHaveAttribute("data-scene", pageId);
  await expect(page.locator("[data-detail-flip]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(player).toHaveAttribute("data-scene", "overview");
  await expect(page).toHaveURL(new RegExp(`/wiki/presentations/${id}/present$`));
});

test("a clicker takes the detour on the path, animated even when the system reduces motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const deckWithPage = [
    ...elements.map((element) => element.id === "lend" ? { ...element, detailId: "page" } : element),
    { id: "page", type: "frame", x: 0, y: 100_000, width: 960, height: 540, rotation: 0, content: { label: "Gegenstandsverleih", shape: "rect", color: "" } },
    { id: "pageText", type: "text", parentId: "page", x: 60, y: 100_060, width: 800, height: 90, rotation: 0, content: { text: "Bohrmaschinen, Leitern", fontSize: 40, bold: true, align: "left", color: "" } },
  ];
  // The author put the box itself on the path: that stop is where the detour happens.
  const id = await seed(page, false, false, deckWithPage, { steps: [{ id: "s1", elementId: "frame" }, { id: "s2", elementId: "lend" }], waitFor: "lend" });
  await page.goto(`/wiki/presentations/${id}/present`);
  const player = page.getByTestId("presentation-player");
  const status = page.getByRole("status").filter({ hasText: "/" });
  await expect(status).toHaveText("1 / 2");
  // The status is server-rendered; the canvas only draws once the player runs in the browser.
  await expect(page.locator('.react-flow__node[data-id="lend"]')).toBeVisible();
  // What the audience sees: no frame names, no library credit.
  await expect(page.locator("[data-frame-label]")).toHaveCount(0);
  await expect(page.locator(".react-flow__attribution")).toHaveCount(0);

  // "Next" on a clicker arrives at the box and turns its page over -- with the card turn.
  // The turn is short, so its layers are counted as they come rather than polled for.
  type Counted = Window & { flipLayers?: number };
  await player.evaluate((root) => {
    (window as Counted).flipLayers = 0;
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) if ((node as HTMLElement).dataset?.detailFlip !== undefined) (window as Counted).flipLayers! += 1;
    }).observe(root, { childList: true });
  });
  await page.keyboard.press("PageDown");
  await expect(player).toHaveAttribute("data-scene", "page");
  await expect.poll(() => page.evaluate(() => (window as Counted).flipLayers)).toBeGreaterThan(0);
  await expect(page.locator("[data-detail-flip]")).toHaveCount(0);

  // The page's last "next" turns back to the box's stop; the overview goes on from there.
  await page.keyboard.press("PageDown");
  await expect(player).toHaveAttribute("data-scene", "overview");
  await expect(status).toHaveText("2 / 2");
  await expect(page.locator("[data-detail-flip]")).toHaveCount(0);

  // On that stop, Down opens the page again and Up closes it.
  await page.keyboard.press("ArrowDown");
  await expect(player).toHaveAttribute("data-scene", "page");
  await expect(page.locator("[data-detail-flip]")).toHaveCount(0);
  await page.keyboard.press("ArrowUp");
  await expect(player).toHaveAttribute("data-scene", "overview");
});
