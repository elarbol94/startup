import { expect, type Page } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";

const PANES = { Eigenschaften: "properties", Design: "design", Medien: "assets", Kommentare: "comments" } as const;
/**
 * Opens a side pane the way an author finds it: the ribbon's Ansicht tab, Bereiche group. Returns to
 * Start -- dispatched, because below 1280 px the open pane is a drawer over the ribbon.
 */
export async function openPane(page: Page, name: string) {
  await page.getByRole("tab", { name: "Ansicht", exact: true }).click();
  const button = page.getByTestId(`ribbon-panel-${PANES[name as keyof typeof PANES]}`);
  if (await button.getAttribute("aria-pressed") !== "true") await button.click();
  // By id: a modal drawer hides the ribbon from role queries.
  await page.locator("#ribbon-tab-home").dispatchEvent("click");
}

/** Shows a tab of the Eigenschaften pane by its name ("Größe und Position", "Animation", ...). */
export async function propertiesTab(page: Page, name: string) {
  await page.getByTestId("presentation-properties").getByRole("tab", { name, exact: true }).click();
}

/** Runs an item of the ribbon's Datei menu. */
export async function fileMenu(page: Page, name: string) {
  await page.getByTestId("presentation-file-menu").click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}

/** `options.steps` replaces the default single stop; `options.settings` overrides playback settings; `options.waitFor` is the node id awaited after load (null waits for nothing). */
export async function seedPresentation(page: Page, withMedia = false, authenticated = false, customElements?: unknown[], options: { steps?: unknown[]; settings?: Record<string, unknown>; waitFor?: string | null } = {}) {
  if (!authenticated) {
    const credentials = { username: "admin", password: "super-secret-1" };
    let auth = await page.request.post("/api/auth/sign-in/username", { data: credentials });
    if (!auth.ok()) auth = await page.request.post("/api/auth/sign-up/email", { data: { ...credentials, name: "E2E Admin", email: "admin@example.com" } });
    expect(auth.ok(), await auth.text()).toBe(true);
  }
  const buffer = Buffer.from(zipSync({
    "ppt/presentation.xml": strToU8('<p:presentation xmlns:p="urn:p" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/></p:presentation>'),
    "ppt/_rels/presentation.xml.rels": strToU8('<Relationships xmlns="urn:r"><Relationship Id="rId1" Target="slides/slide1.xml"/></Relationships>'),
    "ppt/slides/slide1.xml": strToU8('<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><p:cSld><p:spTree/></p:cSld></p:sld>'),
  }));
  const result = await page.request.post("/api/wiki/presentations/import", { multipart: { file: { name: "Interactions.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", buffer } } });
  expect(result.ok(), await result.text()).toBe(true);
  const { id } = await result.json(); const source = await (await page.request.get(`/api/wiki/presentations/${id}`, { maxRetries: 2 })).json();
  const elements = [
    { id: "frame", type: "frame", x: 0, y: 0, width: 1000, height: 650, rotation: 0, content: { label: "Overview", shape: "rect", color: "#6366f1" } },
    { id: "a", type: "text", parentId: "frame", x: 100, y: 100, width: 260, height: 90, rotation: 0, content: { text: "First idea", runs: [{ text: "First", bold: true }, { text: " idea" }], fontSize: 32, bold: false, align: "left", color: "#172033" } },
    { id: "b", type: "text", parentId: "frame", x: 500, y: 100, width: 260, height: 90, rotation: 0, content: { text: "Second idea", fontSize: 32, bold: false, align: "left", color: "#172033" } },
    { id: "line", type: "shape", parentId: "frame", x: 100, y: 350, width: 260, height: 40, rotation: 0, content: { shape: "arrow", fill: "", stroke: "#6366f1", strokeWidth: 4, opacity: 1 } },
  ];
  const media = [];
  if (withMedia) {
    const upload = await page.request.post("/api/files", { multipart: { entityType: "wikiPresentation", entityId: id, file: { name: "pixel.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1sAAAAASUVORK5CYII=", "base64") } } });
    expect(upload.ok(), await upload.text()).toBe(true); const attachment = await upload.json();
    media.push({ id: "image", type: "image", parentId: "frame", x: 650, y: 350, width: 100, height: 100, rotation: 0, content: { attachmentId: attachment.id, alt: "Clipboard image" } });
  }
  const patched = await page.request.patch(`/api/wiki/presentations/${id}`, { data: { ...source, elements: customElements ?? [...elements, ...media], steps: options.steps ?? [{ id: "s1", elementId: "frame" }], settings: { ...source.settings, ...options.settings }, expectedUpdatedAt: source.updatedAt, sessionId: "interaction-fixture" } });
  expect(patched.ok(), await patched.text()).toBe(true);
  await page.goto(`/wiki/presentations/${id}`);
  await expect(page.getByRole("button", { name: "Text", exact: true })).toBeEnabled();
  const waitFor = options.waitFor === undefined ? "a" : options.waitFor;
  if (waitFor) await expect(page.locator(`.react-flow__node[data-id="${waitFor}"]`)).toBeVisible();
  return id as string;
}

export async function placeAtCenter(page: Page) {
  await expect(page.getByTestId("presentation-placement-preview")).toBeAttached();
  await page.locator("[data-presentation-canvas]").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("presentation-placement-preview")).toHaveCount(0);
}

/**
 * Draws a shape from PowerPoint's gallery the way an author does: open "Formen", pick the
 * entry by its PowerPoint name, then click on the canvas (default size, top-left at the
 * click) or drag from `at` to `to`.
 */
export async function drawShape(page: Page, label: string, at?: { x: number; y: number }, to?: { x: number; y: number }) {
  await page.getByTestId("presentation-shapes-button").click();
  await page.getByTestId("presentation-shape-gallery").getByRole("button", { name: label, exact: true }).first().click();
  const layer = page.getByTestId("presentation-draw-layer");
  await expect(layer).toBeVisible();
  const box = (await layer.boundingBox())!;
  const start = at ?? { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  if (to) await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await expect(layer).toHaveCount(0);
}
