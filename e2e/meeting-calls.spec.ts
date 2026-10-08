import { expect, test } from "@playwright/test";
import { loginAsAnyUser } from "./helpers/login";

// Needs a LiveKit server: run `livekit-server --dev` (or the Docker image) and
// start the suite with LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL and
// LIVEKIT_PUBLIC_URL set. Without them the call buttons are hidden and this skips.
test.skip(!process.env.LIVEKIT_API_KEY, "No LiveKit server configured");
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
  permissions: ["microphone", "camera"],
});

test("joins an unrecorded call with the camera off and leaves it after silence", async ({ page }) => {
  test.setTimeout(180_000);
  await loginAsAnyUser(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const title = `Call ${Date.now()}`;

  await page.goto("/meetings");
  await page.getByRole("button", { name: "Neue Besprechung" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Neue Besprechung" });
  await dialog.getByLabel("Titel").fill(title);
  await dialog.getByRole("button", { name: "Anlegen" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  await page.getByRole("button", { name: "Call starten" }).click();
  const start = page.getByRole("dialog", { name: "Online-Call starten" });
  await start.getByText("Call aufnehmen").click();
  await page.clock.install();
  await start.getByRole("button", { name: "Starten" }).click();
  await expect(page).toHaveURL(/\/call$/);
  await page.getByRole("button", { name: "Beitreten" }).click();

  // Connected: the LiveKit control bar is there, the microphone is on and the camera is off.
  const controls = page.locator(".lk-control-bar");
  await expect(controls).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Verbindung fehlgeschlagen")).toHaveCount(0);
  await expect(controls.locator('[data-lk-source="microphone"]')).toHaveAttribute("aria-pressed", "true");
  await expect(controls.locator('[data-lk-source="camera"]')).toHaveAttribute("aria-pressed", "false");
  await page.screenshot({ path: "test-results/meeting-call-joined.png" });

  // The fake microphone plays a tone; muting it makes the room silent.
  await controls.locator('[data-lk-source="microphone"]').click();
  await page.clock.fastForward("15:05");
  const prompt = page.getByRole("alertdialog", { name: "Noch da?" });
  await expect(prompt).toBeVisible();
  await page.screenshot({ path: "test-results/meeting-call-idle.png" });
  await prompt.getByRole("button", { name: "Im Call bleiben" }).click();
  await expect(prompt).toHaveCount(0);

  await page.clock.fastForward("16:10");
  await expect(page.getByText("Du hast den Call nach 15 Minuten Stille automatisch verlassen.")).toBeVisible();
  expect(errors).toEqual([]);
});
