import { expect, test, type Page } from "@playwright/test";
import { zipSync, strToU8 } from "fflate";

test.use({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
test.setTimeout(180_000);
async function seed(page: Page, withMedia = false, authenticated = false) {
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
  const patched = await page.request.patch(`/api/wiki/presentations/${id}`, { data: { ...source, elements: [...elements, ...media], steps: [{ id: "s1", elementId: "frame" }], expectedUpdatedAt: source.updatedAt, sessionId: "interaction-fixture" } });
  expect(patched.ok(), await patched.text()).toBe(true);
  await page.goto(`/wiki/presentations/${id}`);
  await expect(page.getByRole("button", { name: "Text", exact: true })).toBeEnabled();
  await expect(page.locator('.react-flow__node[data-id="a"]')).toBeVisible();
  return id as string;
}
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
const selected = (page: Page) => page.locator(".react-flow__node.selected");
async function save(page: Page) { await page.locator("[data-presentation-canvas]").focus(); await page.keyboard.press("Control+s"); await expect(page.getByTestId("collaboration-status").getByText("Gespeichert", { exact: true })).toBeVisible(); }
async function snapshot(page: Page, id: string) { await save(page); return (await page.request.get(`/api/wiki/presentations/${id}`, { maxRetries: 2 })).json(); }

test("double-click selects all rich text and Escape returns to object selection", async ({ page }) => {
  const id = await seed(page);
  await node(page, "a").dblclick();
  const editor = node(page, "a").locator(".ProseMirror"); await expect(editor).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("First idea");
  await page.keyboard.press("Escape"); await expect(editor).toHaveCount(0);
  const deck = await snapshot(page, id); expect(deck.elements.find((e: { id: string }) => e.id === "a").content.runs[0].bold).toBe(true);
  await node(page, "a").dblclick(); await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe("First idea"); await page.keyboard.type("Replacement"); await page.keyboard.press("Escape");
  expect((await snapshot(page, id)).elements.find((e: { id: string }) => e.id === "a").content.text).toBe("Replacement");
});

test("left-drag marquee, grouping, context menus and keyboard navigation", async ({ page }) => {
  await seed(page); const a = (await node(page, "a").boundingBox())!, b = (await node(page, "b").boundingBox())!;
  await page.mouse.move(a.x - 15, a.y - 15); await page.mouse.down(); await page.mouse.move(b.x + b.width + 15, b.y + b.height + 15, { steps: 10 }); await page.mouse.up();
  await expect(selected(page)).toHaveCount(2);
  await page.locator("[data-presentation-canvas]").focus(); await page.keyboard.press("Control+g"); await expect(selected(page)).toHaveCount(1);
  await selected(page).click({ button: "right", position: { x: 1, y: 1 }, force: true });
  await expect(page.getByRole("menuitem", { name: /Gruppierung aufheben/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Text bearbeiten/ })).toHaveCount(0);
  await page.getByRole("menuitem", { name: /Gruppierung aufheben/ }).click(); await expect(selected(page)).toHaveCount(2);
  await page.locator("[data-presentation-canvas]").focus(); await page.keyboard.press("Control+z"); await expect(page.locator(".react-flow__node-frame")).toHaveCount(2);
  await page.keyboard.press("Control+Shift+z"); await expect(page.locator(".react-flow__node-frame")).toHaveCount(1);
  await page.keyboard.press("Shift+F10"); await expect(page.getByRole("menuitem", { name: /Gruppieren/ })).toBeVisible(); await page.keyboard.press("Escape");
});

test("Ctrl-drag copies once, preserves originals, supports cancellation and undo", async ({ page }) => {
  const id = await seed(page); await node(page, "a").click(); const a = (await node(page, "a").boundingBox())!;
  await page.keyboard.down("Control"); await page.mouse.move(a.x + 30, a.y + 30); await page.mouse.down(); await page.mouse.move(a.x + 140, a.y + 210, { steps: 10 }); await page.mouse.up(); await page.keyboard.up("Control");
  await expect(page.locator(".react-flow__node-text")).toHaveCount(3);
  const deck = await snapshot(page, id); expect(deck.elements.find((e: { id: string }) => e.id === "a")).toMatchObject({ x: 100, y: 100 });
  await page.keyboard.press("Control+z"); await expect(page.locator(".react-flow__node-text")).toHaveCount(2);
  await node(page, "a").click(); await page.keyboard.down("Control"); await page.mouse.move(a.x + 30, a.y + 30); await page.mouse.down(); await page.mouse.move(a.x + 140, a.y + 210, { steps: 10 }); await page.keyboard.press("Escape"); await page.mouse.up(); await page.keyboard.up("Control");
  await expect(page.locator(".react-flow__node-text")).toHaveCount(2);
});

test("shape choices, endpoint handles, adaptive grid, and clipboard round trip", async ({ page }) => {
  const id = await seed(page);
  await page.getByRole("button", { name: "Einfügen", exact: true }).click(); await page.getByRole("menuitem", { name: "Form", exact: true }).hover();
  await expect(page.getByRole("menuitem", { name: "Doppelpfeil", exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "Doppelpfeil", exact: true }).click(); await expect(page.locator(".react-flow__node-shape")).toHaveCount(2);
  await node(page, "line").click(); await expect(page.getByRole("button", { name: "Startpunkt" })).toBeVisible();
  await expect(node(page, "line").locator(".react-flow__resize-control")).toHaveCount(0);
  const end = (await page.getByRole("button", { name: "Endpunkt" }).boundingBox())!;
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2); await page.mouse.down(); await page.mouse.move(end.x + 60, end.y + 100, { steps: 10 }); await page.mouse.up();
  await expect(node(page, "line")).toHaveAttribute("style", /rotate\(/);
  await expect.poll(async () => (await snapshot(page, id)).elements.find((e: { id: string }) => e.id === "line").rotation).not.toBe(0);
  await node(page, "a").click(); await page.locator("[data-presentation-canvas]").focus(); await page.keyboard.press("Control+c"); await page.keyboard.press("Control+v"); await expect(page.locator(".react-flow__node-text")).toHaveCount(3);
  const pattern = page.locator(".react-flow__background pattern"); const before = await pattern.getAttribute("width");
  await page.locator(".react-flow__controls-zoomin").click(); await expect.poll(() => pattern.getAttribute("width")).not.toBe(before);
  await save(page); await page.reload(); await expect(page.locator(".react-flow__node-text")).toHaveCount(3);
});

test("keyboard scope, additive marquee, locks, and panning keep selection predictable", async ({ page }) => {
  const id = await seed(page); await node(page, "a").click();
  const b = (await node(page, "b").boundingBox())!;
  await page.keyboard.down("Shift"); await page.mouse.move(b.x - 15, b.y - 15); await page.mouse.down(); await page.mouse.move(b.x + b.width + 15, b.y + b.height + 15, { steps: 10 }); await page.mouse.up(); await page.keyboard.up("Shift");
  await expect(selected(page)).toHaveCount(2);
  await node(page, "a").click(); await page.locator("[data-presentation-canvas]").focus();
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("Shift+ArrowDown");
  await expect.poll(async () => (await snapshot(page, id)).elements.find((e: { id: string }) => e.id === "a")).toMatchObject({ x: 101, y: 110 });
  await page.getByRole("button", { name: "Auswahlaktionen", exact: true }).click(); await page.getByRole("menuitem", { name: "Sperren", exact: true }).click();
  await page.locator("[data-presentation-canvas]").focus(); await page.keyboard.press("Delete"); await expect(node(page, "a")).toBeVisible();
  await page.keyboard.press("Shift+F10"); await expect(page.getByRole("menuitem", { name: "Entsperren", exact: true })).toBeEnabled(); await page.getByRole("menuitem", { name: "Entsperren", exact: true }).click();
  await node(page, "a").dblclick(); await expect(node(page, "a").locator(".ProseMirror")).toBeFocused(); await page.keyboard.press("Control+a"); await page.keyboard.type("Typing still works"); await page.keyboard.press("Escape");
  await expect(selected(page)).toHaveCount(1);
  await page.keyboard.press("Tab"); await expect(node(page, "b")).toHaveClass(/selected/);
  await page.keyboard.press("Shift+Tab"); await expect(node(page, "a")).toHaveClass(/selected/);
  await node(page, "b").click({ modifiers: ["Control"] }); await expect(selected(page)).toHaveCount(2);
  await node(page, "b").click({ modifiers: ["Control"] }); await expect(selected(page)).toHaveCount(1);
  await page.locator("[data-presentation-canvas]").focus(); await page.keyboard.press("Control+d"); await expect(page.locator(".react-flow__node-text")).toHaveCount(3);
  await page.keyboard.press("Delete"); await expect(page.locator(".react-flow__node-text")).toHaveCount(2);
  await page.keyboard.press("Control+z"); await expect(page.locator(".react-flow__node-text")).toHaveCount(3);
  await page.keyboard.press("Control+z"); await expect(page.locator(".react-flow__node-text")).toHaveCount(2);
  const viewport = page.locator(".react-flow__viewport"); const before = await viewport.getAttribute("style");
  const canvas = (await page.locator("[data-presentation-canvas]").boundingBox())!;
  await page.keyboard.down("Space"); await page.mouse.move(canvas.x + 30, canvas.y + 30); await page.mouse.down(); await page.mouse.move(canvas.x + 100, canvas.y + 90, { steps: 10 }); await page.mouse.up(); await page.keyboard.up("Space");
  await expect.poll(() => viewport.getAttribute("style")).not.toBe(before);
  await page.getByRole("button", { name: "Auswahlaktionen", exact: true }).click(); await page.getByRole("menuitem", { name: "Tastenkürzel", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Ctrl+G");
  await page.screenshot({ path: "output/playwright/presentation-shortcuts.png" });
});

test("new shapes sync to a second editor and render in print and offline HTML", async ({ page, context }) => {
  const id = await seed(page); const other = await context.newPage(); await other.goto(`/wiki/presentations/${id}`);
  await expect(other.getByRole("button", { name: "Text", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Einfügen", exact: true }).click(); await page.getByRole("menuitem", { name: "Form", exact: true }).hover(); await page.getByRole("menuitem", { name: "Raute", exact: true }).click();
  await expect(other.locator(".react-flow__node-shape")).toHaveCount(2);
  await save(page);
  const print = await context.newPage(); await print.goto(`/print/presentations/${id}`);
  await expect(print.locator("svg polygon").first()).toBeAttached();
  const offline = await page.request.get(`/api/wiki/presentations/${id}/offline`);
  expect(offline.ok(), await offline.text()).toBe(true); expect(await offline.text()).toContain("<polygon");
  await other.close(); await print.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Auswahlaktionen", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: /Kopieren/ }).first()).toBeVisible();
  await page.screenshot({ path: "output/playwright/presentation-mobile-actions.png" });
});

test("cross-deck clipboard preserves grouped media and rejects invalid payloads atomically", async ({ page }) => {
  const sourceId = await seed(page, true);
  const source = await snapshot(page, sourceId);
  const attachment = { id: source.elements.find((e: { id: string }) => e.id === "image").content.attachmentId };
  await expect(node(page, "image")).toBeVisible();
  await page.locator("[data-presentation-canvas]").focus(); await page.keyboard.press("Control+a"); await page.keyboard.press("Control+c");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("Clipboard image");
  const destinationId = await seed(page, false, true);
  await page.locator("[data-presentation-canvas]").focus(); await page.keyboard.press("Control+v");
  await expect(page.locator(".react-flow__node")).toHaveCount(9); await save(page);
  const pasted = await snapshot(page, destinationId);
  const media = pasted.elements.find((e: { type: string }) => e.type === "image");
  expect(media.content.attachmentId).not.toBe(attachment.id);
  expect((await page.request.get(`/api/files/${media.content.attachmentId}`)).ok()).toBe(true);
  expect(pasted.elements.filter((e: { parentId?: string }) => e.parentId === media.parentId)).toHaveLength(4);
  await page.locator("[data-presentation-canvas]").focus(); await page.keyboard.press("Control+z"); await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.keyboard.press("Control+y"); await expect(page.locator(".react-flow__node")).toHaveCount(9);
  await page.evaluate(() => navigator.clipboard.writeText('{"kind":"management-presentation","version":1,"elements":[{"id":"invalid"}]}'));
  await page.keyboard.press("Control+v"); await expect(page.getByText("Zwischenablage nicht verfügbar. Zugriff erlauben und gültige Präsentationsobjekte mit zugänglichen Anhängen kopieren.")).toBeVisible();
  await expect(page.locator(".react-flow__node")).toHaveCount(9);
  await node(page, media.parentId).click({ position: { x: 1, y: 30 } });
  await page.locator("[data-presentation-canvas]").focus();
  await page.keyboard.press("Control+x"); await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.keyboard.press("Control+v"); await expect(page.locator(".react-flow__node")).toHaveCount(9);
});
