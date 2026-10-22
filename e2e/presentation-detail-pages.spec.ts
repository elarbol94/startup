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
  // In the app's dark mode the deck still sits on its own white surface.
  await page.emulateMedia({ colorScheme: "dark" });
  const id = await seed(page, false, false, elements, { waitFor: "lend" });
  await expect.poll(() => page.locator(".react-flow__background").evaluate((layer) => getComputedStyle(layer).backgroundColor)).toBe("rgb(255, 255, 255)");

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
  await expect(player).toHaveAttribute("data-scene", "overview");
  await page.locator('.react-flow__node[data-id="lend"]').click();
  await expect(player).toHaveAttribute("data-scene", pageId);
  await expect(page.locator("[data-turning]")).toHaveCount(0);
  await expect(page.getByTestId("presentation-detail-back")).toContainText("Gegenstandsverleih");

  // Past the page's last stop the card turns back. The slide carries no badges: the box only
  // lifts under the pointer.
  await page.keyboard.press("ArrowRight");
  await expect(player).toHaveAttribute("data-scene", "overview");
  await expect(page.locator("[data-detail-badge]")).toHaveCount(0);
  await expect(page.locator('.react-flow__node[data-id="lend"]')).toHaveClass(/presentation-opener/);
  // Input during a turn is dropped; the next click comes once the card has landed.
  await expect(player).not.toHaveAttribute("data-turning");

  // Escape leaves a page first and only then the presentation.
  await page.locator('.react-flow__node[data-id="lend"]').click();
  await expect(player).toHaveAttribute("data-scene", "overview");
  await page.locator('.react-flow__node[data-id="lend"]').click();
  await expect(player).toHaveAttribute("data-scene", pageId);
  await expect(page.locator("[data-turning]")).toHaveCount(0);
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
  // The turn is short, so it is counted as it starts rather than polled for.
  type Counted = Window & { turns?: number };
  await player.evaluate((root) => {
    (window as Counted).turns = 0;
    new MutationObserver(() => { if (root.dataset.turning) (window as Counted).turns! += 1; }).observe(root, { attributes: true, attributeFilter: ["data-turning"] });
  });
  await page.keyboard.press("PageDown");
  await expect(player).toHaveAttribute("data-scene", "page");
  await expect.poll(() => page.evaluate(() => (window as Counted).turns)).toBeGreaterThan(0);
  await expect(page.locator("[data-turning]")).toHaveCount(0);

  // The page's last "next" turns back to the box's stop; the overview goes on from there.
  await page.keyboard.press("PageDown");
  await expect(player).toHaveAttribute("data-scene", "overview");
  await expect(status).toHaveText("2 / 2");
  await expect(page.locator("[data-turning]")).toHaveCount(0);

  // On that stop, Down opens the page again and Up closes it.
  await page.keyboard.press("ArrowDown");
  await expect(player).toHaveAttribute("data-scene", "page");
  await expect(page.locator("[data-turning]")).toHaveCount(0);
  await page.keyboard.press("ArrowUp");
  await expect(player).toHaveAttribute("data-scene", "overview");
  await expect(page.locator("[data-turning]")).toHaveCount(0);

  // A window that stops painting freezes animations; a turn still completes and keys keep working.
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args: Parameters<typeof animate>) { const animation = animate.apply(this, args); animation.pause(); return animation; };
  });
  await page.keyboard.press("ArrowDown");
  await expect(player).toHaveAttribute("data-scene", "page");
  await expect(page.locator("[data-turning]")).toHaveCount(0);
  await page.keyboard.press("ArrowUp");
  await expect(player).toHaveAttribute("data-scene", "overview");
  await expect(page.locator("[data-turning]")).toHaveCount(0);
});

/** The overview with "lend" opening a page of its own that has no stops, and "ride" after it. */
const detourDeck = [
  ...elements.map((element) => element.id === "lend" ? { ...element, detailId: "page" } : element),
  { id: "page", type: "frame", x: 0, y: 100_000, width: 960, height: 540, rotation: 0, content: { label: "Gegenstandsverleih", shape: "rect", color: "" } },
  { id: "pageText", type: "text", parentId: "page", x: 60, y: 100_060, width: 800, height: 90, rotation: 0, content: { text: "Bohrmaschinen, Leitern", fontSize: 40, bold: true, align: "left", color: "" } },
];
const detourSteps = [{ id: "s1", elementId: "frame", notes: "Opening words" }, { id: "s2", elementId: "lend" }, { id: "s3", elementId: "ride" }];

test("autoplay goes on through card turns that outlast a stop", async ({ page }) => {
  // Stops shorter than the turn: each tick lands while the card is still turning.
  const id = await seed(page, false, false, detourDeck, { steps: detourSteps, settings: { defaultStepDurationMs: 500, cameraTransitionMs: 2000 }, waitFor: "lend" });
  await page.goto(`/wiki/presentations/${id}/present`);
  const player = page.getByTestId("presentation-player");
  const status = page.getByRole("status").filter({ hasText: "/" });
  await expect(page.locator('.react-flow__node[data-id="lend"]')).toBeVisible();
  type Seen = Window & { scenes?: string[] };
  await player.evaluate((root) => {
    (window as Seen).scenes = [];
    new MutationObserver(() => (window as Seen).scenes!.push(root.dataset.scene ?? "")).observe(root, { attributes: true, attributeFilter: ["data-scene"] });
  });
  await page.getByRole("button", { name: "Wiedergabe" }).click();
  // Into the page and out again, on to the last stop, where autoplay stops by itself.
  await expect(status).toHaveText("3 / 3", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Wiedergabe" })).toBeVisible();
  expect(await page.evaluate(() => (window as Seen).scenes)).toContain("page");
});

test("the presenter view walks into and out of detail pages with the player", async ({ page, context }) => {
  const id = await seed(page, false, false, detourDeck, { steps: detourSteps, waitFor: "lend" });
  await page.goto(`/wiki/presentations/${id}/present`);
  const player = page.getByTestId("presentation-player");
  const status = page.getByRole("status").filter({ hasText: "/" });
  await expect(page.locator('.react-flow__node[data-id="lend"]')).toBeVisible();
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Präsentationsansicht öffnen" }).click();
  const popup = await popupPromise;
  const position = popup.getByTestId("presenter-position");
  const next = popup.getByRole("button", { name: "Nächste Station" });
  const notes = popup.getByRole("textbox", { name: "Sprechernotizen" });
  // Counted like the player: within the open scene, not across every stop of every page.
  await expect(position).toHaveText("1 / 3", { timeout: 30_000 });
  await expect(notes).toHaveValue("Opening words");

  // "Next" onto the box takes the detour, exactly as the player's own "next" would -- from a
  // clicker too, whose keys go to this window while the presenter looks at it.
  await popup.keyboard.press("PageDown");
  await expect(player).toHaveAttribute("data-scene", "page");
  await expect(position).toHaveText("Gegenstandsverleih · 1 / 1");
  await expect(page.locator("[data-turning]")).toHaveCount(0);
  // The page has no step of its own, so there is nothing to keep notes on.
  await expect(notes).toBeDisabled();
  await expect(popup.getByText("Diese Detailseite hat keine eigene Station.", { exact: false })).toBeVisible();

  await next.click();
  await expect(player).toHaveAttribute("data-scene", "overview");
  await expect(status).toHaveText("2 / 3");
  await expect(position).toHaveText("2 / 3");
  await expect(page.locator("[data-turning]")).toHaveCount(0);
  await next.click();
  await expect(status).toHaveText("3 / 3");
  await expect(position).toHaveText("3 / 3");
  // The end of the talk is the end for both windows.
  await expect(next).toBeDisabled();
  await expect(popup.getByText("Dies ist die letzte Station")).toBeVisible();
  await popup.keyboard.press("ArrowLeft");
  await expect(status).toHaveText("2 / 3");
  await expect(position).toHaveText("2 / 3");
});

test("a fade-in outside the view widens it, and keys sent to the window still work", async ({ page }) => {
  // The camera frames "start"; "ride" fades in far below it.
  const id = await seed(page, false, false, elements, { steps: [{ id: "s1", elementId: "start" }, { id: "s2", elementId: "ride", action: "fadeIn" }], waitFor: "ride" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/wiki/presentations/${id}/present`);
  const status = page.getByRole("status").filter({ hasText: "/" });
  await expect(page.locator('.react-flow__node[data-id="start"]')).toBeVisible();
  await expect(status).toHaveText("1 / 2");
  // Clicker software may send its key to the window itself, which has no element to look at.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })));
  await expect(status).toHaveText("2 / 2");
  const ride = page.locator('.react-flow__node[data-id="ride"]');
  await expect(ride).toHaveCSS("opacity", "1");
  await expect.poll(async () => {
    const box = await ride.boundingBox(), viewport = page.viewportSize()!;
    return Boolean(box && box.y >= 0 && box.y + box.height <= viewport.height && box.x >= 0 && box.x + box.width <= viewport.width);
  }).toBe(true);
  expect(errors).toEqual([]);
});

test("a click on a shape covering a frame stands for the frame", async ({ page }) => {
  const cover = (id: string, parentId: string, x: number) => ({ id, type: "shape", parentId, x, y: 150, width: 300, height: 200, rotation: 0,
    content: { shape: "ellipse", fill: "#c7e6dc", stroke: "#172033", strokeWidth: 2, opacity: 1, text: id } });
  const area = (id: string, x: number, extra = {}) => ({ id, type: "frame", parentId: "frame", x, y: 150, width: 300, height: 200, rotation: 0, content: { label: "", shape: "rect", color: "" }, ...extra });
  const map = [
    elements[0],
    area("north", 80), cover("northDisc", "north", 80),
    area("south", 600, { detailId: "page" }), cover("southDisc", "south", 600),
    ...detourDeck.slice(-2),
  ];
  const id = await seed(page, false, false, map, { steps: [{ id: "s1", elementId: "frame" }, { id: "s2", elementId: "north" }], waitFor: "northDisc" });
  await page.goto(`/wiki/presentations/${id}/present`);
  const player = page.getByTestId("presentation-player");
  const status = page.getByRole("status").filter({ hasText: "/" });
  await expect(status).toHaveText("1 / 2");
  // The disc is all a presenter can click of the frame; it jumps to the frame's stop.
  await page.locator('.react-flow__node[data-id="northDisc"]').click();
  await expect(status).toHaveText("2 / 2");
  // A disc on a frame with a detail page turns that page over.
  await page.keyboard.press("Home");
  await page.locator('.react-flow__node[data-id="southDisc"]').click();
  await expect(player).toHaveAttribute("data-scene", "overview");
  await page.locator('.react-flow__node[data-id="southDisc"]').click();
  await expect(player).toHaveAttribute("data-scene", "page");
});
