import { expect, test } from "@playwright/test";
import Database from "better-sqlite3";
import path from "node:path";
import { randomUUID } from "node:crypto";

for (const legacy of [false, true]) {
  test(`${legacy ? "legacy" : "renamed"} document links preserve section and task context`, async ({ page }) => {
    const login = await page.request.post("/api/auth/sign-in/username", { data: { username: "admin", password: "super-secret-1" } });
    expect(login.ok()).toBe(true);
    const { user } = await (await page.request.get("/api/auth/get-session")).json();
    const id = randomUUID();
    const oldSlug = `old-${id}`, newSlug = `current-${id}`;
    const sqlite = new Database(path.resolve("data/e2e.db"));
    try {
      sqlite.prepare("INSERT INTO wiki_pages (id, title, slug, previous_slugs, content_json, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, "Renamed document", newSlug, oldSlug, JSON.stringify({ type: "doc", content: [{ type: "heading", attrs: { level: 1, id: "budget" }, content: [{ type: "text", text: "Budget" }] }] }), user.id, user.id, Date.now(), Date.now());
    } finally { sqlite.close(); }
    const query = "section=budget&task=linked-task&tag=one&tag=two";
    await page.goto(`/wiki/${legacy ? "" : "pages/"}${oldSlug}?${query}`);
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/wiki/pages/${newSlug}`);
    expect(new URL(page.url()).searchParams.get("section")).toBe("budget");
    expect(new URL(page.url()).searchParams.get("task")).toBe("linked-task");
    expect(new URL(page.url()).searchParams.getAll("tag")).toEqual(["one", "two"]);
    await expect(page.locator(".ProseMirror #budget")).toBeVisible();
  });
}
