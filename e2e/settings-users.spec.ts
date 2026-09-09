import { expect, test } from "@playwright/test";
import { SMTPServer } from "smtp-server";

const inbox: Array<{ to: string; text: string }> = [];
const smtp = new SMTPServer({
  disabledCommands: ["AUTH", "STARTTLS"],
  onData(stream, session, callback) {
    let text = "";
    stream.on("data", (chunk) => { text += chunk.toString(); });
    stream.on("end", () => {
      // Decode the quoted-printable line folding in Nodemailer's text message.
      const decoded = text.replace(/=\r?\n/g, "").replace(/=([A-F0-9]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      inbox.push({ to: session.envelope.rcptTo[0].address, text: decoded });
      callback();
    });
  },
});
test.beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    smtp.once("error", reject);
    smtp.listen(Number(process.env.PLAYWRIGHT_SMTP_PORT ?? 3126), "127.0.0.1", resolve);
  });
});
test.afterAll(async () => { await new Promise<void>((resolve) => smtp.close(resolve)); });

test("admins invite users who choose their credentials; links work once and roles stay enforced", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const signup = await page.request.post("/api/auth/sign-up/email", {
    data: { name: "E2E Admin", username: "admin", email: "admin@example.com", password: "super-secret-1" },
  });
  if (!signup.ok()) {
    expect([403, 422]).toContain(signup.status());
    const login = await page.request.post("/api/auth/sign-in/username", {
      data: { username: "admin", password: "super-secret-1" },
    });
    expect(login.ok()).toBeTruthy();
  }
  await page.goto("/settings/users");
  const suffix = Date.now();
  for (const [role, label] of [["member", "Mitglied"], ["personnel", "Personal und Buchhaltung"], ["admin", "Administrator"]] as const) {
    const username = `colleague.${role}.${suffix}`;
    const email = `${username}@example.com`;
    await page.getByRole("button", { name: "Benutzer einladen" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator('input[type="password"]')).toHaveCount(0);
    await dialog.getByLabel("E-Mail", { exact: true }).fill(email);
    if (role !== "member") {
      await dialog.getByRole("combobox").click();
      await page.getByRole("option", { name: label, exact: true }).click();
    }
    await dialog.getByRole("button", { name: "Einladung senden", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("region", { name: "Offene Einladungen" })).toContainText(email);
    await expect.poll(() => inbox.find((message) => message.to === email)).toBeTruthy();
    const invitationUrl = inbox.find((message) => message.to === email)!.text.match(/https?:\/\/[^\s]+/)![0];

    const colleague = await browser.newContext();
    try {
      const premature = await colleague.request.post("/api/auth/sign-in/username", {
        data: { username, password: "colleague-password-123" },
      });
      expect(premature.ok()).toBe(false);
      const colleaguePage = await colleague.newPage();
      await colleaguePage.goto(invitationUrl);
      await colleaguePage.reload(); // Email previews/repeated opens must not consume it.
      await expect(colleaguePage.getByLabel("E-Mail", { exact: true })).toHaveValue(email);
      await expect(colleaguePage.getByLabel("E-Mail", { exact: true })).toHaveAttribute("readonly", "");
      await colleaguePage.getByLabel("Nickname", { exact: true }).fill("ADMIN");
      await colleaguePage.getByLabel("Passwort", { exact: true }).fill("colleague-password-123");
      await colleaguePage.getByLabel("Passwort bestätigen").fill("different-password");
      await colleaguePage.getByRole("button", { name: "Konto erstellen" }).click();
      await expect(colleaguePage.getByRole("main").getByRole("alert")).toContainText("Passwörter stimmen nicht überein");
      await colleaguePage.getByLabel("Passwort bestätigen").fill("colleague-password-123");
      await colleaguePage.getByRole("button", { name: "Konto erstellen" }).click();
      await expect(colleaguePage.getByRole("main").getByRole("alert")).toContainText("Nickname wird bereits verwendet");
      await colleaguePage.getByLabel("Nickname", { exact: true }).fill(username);
      await colleaguePage.getByRole("button", { name: "Konto erstellen" }).click();
      await expect(colleaguePage.getByText("Dein Konto ist bereit", { exact: true })).toBeVisible();
      await expect(colleaguePage).toHaveURL(/\/invite$/);
      await colleaguePage.goto(invitationUrl);
      await expect(colleaguePage.getByText("Einladung nicht verfügbar", { exact: true })).toBeVisible();
      await expect(colleaguePage.getByLabel("Nickname", { exact: true })).toHaveCount(0);

      const login = await colleague.request.post("/api/auth/sign-in/username", {
        data: { username: username.toUpperCase(), password: "colleague-password-123" },
      });
      expect(login.ok(), await login.text()).toBeTruthy();
      expect((await login.json()).user.role).toBe(role);
      const publicSignup = await colleague.request.post("/api/auth/sign-up/email", {
        data: { name: "Forbidden", username: `public.${role}.${suffix}`, email: `public.${role}.${suffix}@example.com`, password: "password-123" },
      });
      expect(publicSignup.status()).toBe(403);
      if (role !== "admin") {
        const forbidden = await colleague.request.post("/api/auth/admin/create-user", {
          data: { name: "Forbidden", email: `forbidden.${role}.${suffix}@example.com`, password: "password-123", role: "admin", data: { username: `forbidden.${role}.${suffix}` } },
        });
        expect(forbidden.status()).toBe(403);
        await colleaguePage.goto("/settings/users");
        await expect(colleaguePage).toHaveURL(/\/settings\/profile$/);
        await expect(colleaguePage.getByRole("button", { name: "Benutzer einladen" })).toHaveCount(0);
      }
    } finally {
      await colleague.close();
    }
    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: username })).toContainText(label);
  }
  const mailCount = inbox.length;
  await page.getByRole("button", { name: "Benutzer einladen" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("E-Mail", { exact: true }).fill(`COLLEAGUE.MEMBER.${suffix}@example.com`);
  await dialog.getByRole("button", { name: "Einladung senden", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Ein Konto mit dieser E-Mail-Adresse existiert bereits");
  expect(inbox).toHaveLength(mailCount);
});

test("admins remove users on desktop and mobile; removed sessions and credentials stop working", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const signup = await page.request.post("/api/auth/sign-up/email", {
    data: { name: "E2E Admin", username: "admin", email: "admin@example.com", password: "super-secret-1" },
  });
  if (!signup.ok()) {
    const login = await page.request.post("/api/auth/sign-in/username", {
      data: { username: "admin", password: "super-secret-1" },
    });
    expect(login.ok(), await login.text()).toBe(true);
  }
  await page.goto("/settings/users");
  const ownRow = page.getByRole("row").filter({ hasText: "admin@example.com" });
  await expect(ownRow.getByRole("button", { name: "Benutzer entfernen" })).toHaveCount(0);
  await expect(ownRow).toContainText("Dein Konto");

  for (const role of ["member", "admin"] as const) {
    const nickname = `remove.${role}.${Date.now()}`;
    const email = `${nickname}@example.com`;
    const created = await page.request.post("/api/auth/admin/create-user", {
      headers: { Origin: new URL(page.url()).origin },
      data: { name: nickname, email, password: "remove-user-password", role, data: { username: nickname } },
    });
    expect(created.ok(), await created.text()).toBe(true);
    const colleague = await browser.newContext();
    try {
      const signedIn = await colleague.request.post("/api/auth/sign-in/username", {
        data: { username: nickname, password: "remove-user-password" },
      });
      expect(signedIn.ok()).toBe(true);
      if (role === "admin") await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      const entry = role === "admin"
        ? page.locator("article").filter({ hasText: email })
        : page.getByRole("row").filter({ hasText: email });
      await entry.getByRole("button", { name: "Benutzer entfernen" }).click();
      let dialog = page.getByRole("dialog");
      await expect(dialog).toContainText(email);
      await dialog.getByRole("button", { name: "Abbrechen", exact: true }).click();
      await expect(entry).toBeVisible();
      expect(await (await colleague.request.get("/api/auth/get-session")).json()).not.toBeNull();
      await entry.getByRole("button", { name: "Benutzer entfernen" }).click();
      dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "Konto entfernen", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(entry).toHaveCount(0);
      expect(await (await colleague.request.get("/api/auth/get-session")).json()).toBeNull();
      const denied = await colleague.request.post("/api/auth/sign-in/username", {
        data: { username: nickname, password: "remove-user-password" },
      });
      expect(denied.ok()).toBe(false);
      const colleaguePage = await colleague.newPage();
      await colleaguePage.goto("/settings/profile");
      await expect(colleaguePage).toHaveURL(/\/login$/);
      await page.getByRole("button", { name: "Benutzer einladen" }).click();
      dialog = page.getByRole("dialog");
      await dialog.getByLabel("E-Mail", { exact: true }).fill(email);
      await dialog.getByRole("button", { name: "Einladung senden", exact: true }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("region", { name: "Offene Einladungen" })).toContainText(email);
    } finally { await colleague.close(); }
  }
});
