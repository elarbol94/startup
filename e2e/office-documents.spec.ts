import { expect, test, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import { createHmac } from "node:crypto";
import http from "node:http";
import path from "node:path";
import { strToU8, zipSync } from "fflate";
import { loginAsAnyUser } from "./helpers/login";

/*
 * Office documents without a real ONLYOFFICE server: this spec plays the
 * document server (signed callbacks, cache files, CommandService,
 * ConvertService) on the port playwright.config.ts gives the app as
 * ONLYOFFICE_INTERNAL_URL. The real-server checklist is in
 * docs/office-documents.md.
 */
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const docServerPort = port + 5;
const INBOX = "e2e-office-inbox-secret-0123456789abcdef";
const OUTBOX = "e2e-office-outbox-secret-0123456789abcdef";
const appUrl = `http://localhost:${port}`;

const b64 = (value: string) => Buffer.from(value).toString("base64url");
function sign(payload: object, secret: string) {
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify(payload));
  return `${head}.${body}.${createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;
}

function docx(...paragraphs: string[]) {
  const body = paragraphs.map((text) => text.startsWith("<") ? text : `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`).join("");
  return Buffer.from(zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    "word/document.xml": strToU8(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`),
  }));
}

const files = new Map<string, Buffer>();
let fileCounter = 0;
/** What the next forcesave command will "save". */
let pendingSave: { pageId: string; key: string; content: Buffer } | null = null;
let server: http.Server;

function cacheUrl(content: Buffer) {
  const name = `f${++fileCounter}`;
  files.set(`/cache/files/data/${name}/output.docx`, content);
  // Reported like the real server: public origin with the /office prefix.
  return `${appUrl}/office/cache/files/data/${name}/output.docx`;
}

async function callback(pageId: string, payload: Record<string, unknown>) {
  return fetch(`${appUrl}/api/wiki/office/callback?page=${encodeURIComponent(pageId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sign({ payload }, OUTBOX)}` },
    body: JSON.stringify(payload),
  });
}

test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://docserver");
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const file = files.get(url.pathname);
      if (request.method === "GET" && file) { response.writeHead(200); response.end(file); return; }
      if (request.method === "POST" && (url.pathname === "/command" || url.pathname === "/converter")) {
        const token = (request.headers.authorization ?? "").replace(/^Bearer /, "");
        const [head, body, signature] = token.split(".");
        if (createHmac("sha256", INBOX).update(`${head}.${body}`).digest("base64url") !== signature) { response.writeHead(403); response.end(); return; }
        const payload = JSON.parse(Buffer.from(body, "base64url").toString()).payload;
        response.setHeader("Content-Type", "application/json");
        if (url.pathname === "/converter") {
          files.set("/cache/files/data/conv/output.pdf", Buffer.from("%PDF-1.4\n% e2e\n"));
          response.end(JSON.stringify({ endConvert: true, percent: 100, fileUrl: "http://docserver/cache/files/data/conv/output.pdf" }));
          return;
        }
        if (payload.c === "info") { response.end(JSON.stringify({ error: 0, users: [] })); return; }
        if (payload.c === "forcesave") {
          const save = pendingSave;
          pendingSave = null;
          if (!save || save.key !== payload.key) { response.end(JSON.stringify({ error: 4 })); return; }
          response.end(JSON.stringify({ error: 0 }));
          // Like the real server, the callback follows the command response.
          setTimeout(() => void callback(save.pageId, { key: save.key, status: 6, url: cacheUrl(save.content), lastsave: new Date().toISOString(), forcesavetype: 0, userdata: payload.userdata }), 200);
          return;
        }
        response.end(JSON.stringify({ error: 0 }));
        return;
      }
      response.writeHead(404);
      response.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(docServerPort, "127.0.0.1", resolve));
});

test.afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

function database() { return new Database(path.resolve("data/e2e.db")); }
function query<T>(sql: string, ...args: unknown[]) {
  const db = database();
  try { return db.prepare(sql).all(...args) as T[]; } finally { db.close(); }
}

async function createDocument(page: Page, title: string) {
  await page.goto("/wiki/pages");
  await page.getByRole("button", { name: /Word-Dokument/ }).click();
  await page.getByRole("menuitem", { name: "Neues Word-Dokument" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titel").fill(title);
  await dialog.getByRole("button", { name: "Erstellen" }).click();
  await expect(page.getByRole("button", { name: `Umbenennen: ${title}` })).toBeVisible({ timeout: 60_000 });
  const [row] = query<{ id: string }>("SELECT id FROM wiki_pages WHERE title = ? ORDER BY created_at DESC LIMIT 1", title);
  return row.id;
}

async function sessionKey(page: Page, pageId: string) {
  const response = await page.request.get(`/api/wiki/office/${pageId}/config`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { config: { document: { key: string } } }).config.document.key;
}

test.describe("office documents (simulated document server)", () => {
  test("stores versions, derives search, sources and backlinks, and restores", async ({ page }) => {
    // Several saves, each with a PDF conversion, on a cold dev server.
    test.setTimeout(180_000);
    await loginAsAnyUser(page);
    const target = await createDocument(page, "Office link target");
    const pageId = await createDocument(page, "Office e2e report");
    await expect(page.getByText(/Gespeichert: Version 1/)).toBeVisible();
    const key = await sessionKey(page, pageId);

    const sourceId = "office-e2e-source";
    const [user] = query<{ id: string }>('SELECT id FROM "user" LIMIT 1');
    const db = database();
    try {
      db.prepare("INSERT OR IGNORE INTO wiki_sources (id, title, issued_date, created_by, updated_by, created_at, updated_at) VALUES (?, 'Office E2E Source', '2025', ?, ?, 0, 0)").run(sourceId, user.id, user.id);
    } finally { db.close(); }
    const targetSlug = query<{ slug: string }>("SELECT slug FROM wiki_pages WHERE id = ?", target)[0].slug;
    const content = docx(
      "Zephyrfalke berichtet über Windkraft.",
      `<w:p><w:sdt><w:sdtPr><w:tag w:val="mp:cite:{&quot;ids&quot;:[&quot;${sourceId}&quot;],&quot;loc&quot;:&quot;3&quot;}"/></w:sdtPr><w:sdtContent><w:r><w:t>[1, p. 3]</w:t></w:r></w:sdtContent></w:sdt></w:p>`,
      `<w:p><w:r><w:instrText> HYPERLINK "${appUrl}/wiki/pages/${targetSlug}" </w:instrText></w:r><w:r><w:t>Ziel</w:t></w:r></w:p>`,
    );

    // A checkpoint succeeds only with its own callback.
    pendingSave = { pageId, key, content };
    await page.getByRole("button", { name: "Version speichern" }).click();
    await expect(page.getByText("Version gespeichert – PDF liegt unter Anhänge.")).toBeVisible({ timeout: 30_000 });
    // The success toast covers the header buttons until it goes away (hovering pauses it).
    await page.mouse.move(0, 0);
    await expect(page.getByText("Version gespeichert – PDF liegt unter Anhänge.")).toBeHidden({ timeout: 20_000 });
    expect(query("SELECT file_name FROM attachments WHERE entity_type = 'wikiPage' AND entity_id = ?", pageId)).toEqual([{ file_name: "Office e2e report – Version 2.pdf" }]);
    await expect(page.getByText(/Gespeichert: Version 2/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Version speichern" }).click();
    await expect(page.getByText("Keine neuen Änderungen zu speichern.")).toBeVisible({ timeout: 30_000 });

    expect(query("SELECT source_id FROM wiki_page_sources WHERE page_id = ?", pageId)).toEqual([{ source_id: sourceId }]);
    expect(query("SELECT target_page_id FROM wiki_links WHERE source_page_id = ?", pageId)).toEqual([{ target_page_id: target }]);
    const search = await (await page.request.get("/api/wiki/office/pages?q=Zephyrfalke")).json() as { pages: Array<{ title: string }> };
    expect(search.pages.map((item) => item.title)).toContain("Office e2e report");

    // Late or out-of-order saves never replace newer content.
    const older = await callback(pageId, { key, status: 6, url: cacheUrl(docx("Veraltet")), lastsave: "2000-01-01T00:00:00.000Z" });
    expect(await older.json()).toEqual({ error: 0 });
    expect(query<{ content_text: string }>("SELECT content_text FROM wiki_pages WHERE id = ?", pageId)[0].content_text).toContain("Zephyrfalke");

    // Forged callbacks are refused.
    const forged = await fetch(`${appUrl}/api/wiki/office/callback?page=${pageId}`, { method: "POST", headers: { Authorization: `Bearer ${sign({ payload: { key, status: 4 } }, INBOX)}` }, body: "{}" });
    expect(forged.status).toBe(403);

    // Stored exports.
    const docxExport = await page.request.get(`/api/wiki/office/${pageId}/export?format=docx`);
    expect(docxExport.headers()["content-type"]).toContain("wordprocessingml");
    const pdfExport = await page.request.get(`/api/wiki/office/${pageId}/export?format=pdf`);
    expect(pdfExport.headers()["content-type"]).toBe("application/pdf");

    // Final save when everybody left, then restore version 1.
    await callback(pageId, { key, status: 2, url: cacheUrl(docx("Zephyrfalke final")), lastsave: new Date().toISOString(), history: { serverVersion: "9.4.0", changes: [] } });
    await page.reload();
    await page.getByRole("button", { name: /Mehr|More/ }).last().click();
    await page.getByRole("menuitem", { name: "Versionen" }).click();
    const versions = page.getByRole("dialog").locator("li");
    await expect(versions).toHaveCount(4);
    page.once("dialog", (dialog) => void dialog.accept());
    await versions.last().getByRole("button", { name: "Wiederherstellen" }).click();
    await expect(page.getByText("Version wiederhergestellt.")).toBeVisible({ timeout: 30_000 });
    expect(query<{ kind: string }>("SELECT kind FROM wiki_office_versions WHERE page_id = ? ORDER BY version", pageId).map((row) => row.kind))
      .toEqual(["create", "forcesave", "branch", "final", "restore"]);
    expect(query("SELECT target_page_id FROM wiki_links WHERE source_page_id = ?", pageId)).toEqual([]);
  });

  test("converts an old-editor document from the admin settings", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAsAnyUser(page);
    const [user] = query<{ id: string }>('SELECT id FROM "user" LIMIT 1');
    const id = `legacy-${Date.now()}`;
    const body = { type: "doc", content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Altes Konzept" }] },
      { type: "paragraph", content: [{ type: "text", text: "Mondrakete und " }, { type: "text", text: "Link", marks: [{ type: "link", attrs: { href: "https://example.org/" } }] }] },
      { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Erledigt" }] }] }] },
    ] };
    const db = database();
    try {
      db.prepare("INSERT INTO wiki_pages (id, title, slug, content_json, document_mode, created_by, updated_by, created_at, updated_at) VALUES (?, 'Altes Konzept', ?, ?, 1, ?, ?, ?, ?)")
        .run(id, id, JSON.stringify(body), user.id, user.id, Date.now(), Date.now());
    } finally { db.close(); }

    await page.goto("/settings/documents");
    const row = page.getByRole("listitem").filter({ hasText: "Altes Konzept" });
    page.once("dialog", (dialog) => void dialog.accept());
    await row.getByRole("button", { name: "Umwandeln" }).click();
    await expect(row.getByText("Umgewandelt", { exact: true })).toBeVisible({ timeout: 90_000 });
    expect(query<{ document_engine: string; content_text: string }>("SELECT document_engine, content_text FROM wiki_pages WHERE id = ?", id)[0])
      .toMatchObject({ document_engine: "office" });
    expect(query<{ kind: string }>("SELECT kind FROM wiki_page_revisions WHERE page_id = ?", id)).toEqual([{ kind: "conversion" }]);

    await page.goto(`/wiki/pages/${id}`);
    await expect(page.getByText(/Gespeichert: Version 1/)).toBeVisible();
    const legacy = await page.request.get(`/api/wiki/pages/${id}/export?format=html&disposition=inline`);
    expect(await legacy.text()).toContain("Mondrakete");
  });

  test("keeps office documents out of the TipTap and presentation paths", async ({ page }) => {
    await loginAsAnyUser(page);
    const pageId = await createDocument(page, "Office guard check");
    const legacy = await page.request.get(`/api/wiki/collaboration/page/${pageId}`);
    expect(legacy.ok()).toBe(false);
    const list = await (await page.request.get("/api/wiki/presentation-sources")).json() as { documents: Array<{ id: string }> };
    expect(list.documents.map((document) => document.id)).not.toContain(pageId);
    expect(await (await page.request.get(`/api/wiki/presentation-sources?source=${pageId}`)).json()).toEqual({ document: null });
  });
});
