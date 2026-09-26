import { expect, type Page } from "@playwright/test";

const PASSWORD = "super-secret-1";
// Sign-up only works on an empty database, so reuse whichever account an earlier spec created.
const KNOWN_USERNAMES = ["admin", "document-editor", "reliable-editor", "figure-editor", "table-editor", "markdown-editor"];

async function post(page: Page, url: string, data: Record<string, string>) {
  let response = await page.request.post(url, { data });
  // Auth routes can 404 briefly while the dev server compiles them.
  for (let attempt = 0; response.status() === 404 && attempt < 5; attempt += 1) {
    await page.waitForTimeout(1_000);
    response = await page.request.post(url, { data });
  }
  return response;
}

/** Signs in with an existing e2e account, or creates the admin on a fresh database. Returns the user id. */
export async function loginAsAnyUser(page: Page): Promise<string> {
  for (const username of KNOWN_USERNAMES) {
    const response = await post(page, "/api/auth/sign-in/username", { username, password: PASSWORD });
    if (response.ok()) return sessionUserId(page);
  }
  const response = await post(page, "/api/auth/sign-up/email", { name: "E2E Admin", username: "admin", displayUsername: "admin", email: "admin@example.com", password: PASSWORD });
  expect(response.ok(), await response.text()).toBe(true);
  return sessionUserId(page);
}

async function sessionUserId(page: Page) {
  return (await (await page.request.get("/api/auth/get-session")).json()).user.id as string;
}
