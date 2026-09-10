import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), preview: vi.fn(), restore: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/db", () => ({ sqlite: {} }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("./restore-hooks", () => ({ restoreHook: vi.fn() }));
vi.mock("./store", async importOriginal => ({ ...await importOriginal<typeof import("./store")>(), previewRestore: mocks.preview, restoreVersion: mocks.restore }));
import { previewPlatformRestore, restorePlatformVersion } from "./actions";
import { RestoreError } from "./store";
const input = { id: 1, side: "before" as const, token: "a".repeat(64), reason: "Repair accidental edit" };
beforeEach(() => { vi.resetAllMocks(); mocks.admin.mockResolvedValue({ id: "admin" }); });
it.each(["Unauthorized", "Forbidden"])("enforces %s for previews and mutations", async message => {
  mocks.admin.mockRejectedValue(new Error(message));
  await expect(previewPlatformRestore(input)).rejects.toThrow(message);
  await expect(restorePlatformVersion(input)).rejects.toThrow(message);
  expect(mocks.preview).not.toHaveBeenCalled(); expect(mocks.restore).not.toHaveBeenCalled();
});
it("validates selection, concurrency token and explanation before mutation", async () => {
  await expect(restorePlatformVersion({ ...input, token: "invalid" })).rejects.toThrow();
  await expect(restorePlatformVersion({ ...input, reason: " " })).rejects.toThrow();
  expect(mocks.restore).not.toHaveBeenCalled();
});
it("uses the authenticated admin and refreshes only after a successful restore", async () => {
  expect(await restorePlatformVersion(input)).toEqual({ error: null });
  expect(mocks.restore).toHaveBeenCalledWith({}, input, "admin", expect.any(Function));
  expect(mocks.revalidate).toHaveBeenCalledWith("/", "layout");
});
it("returns conflicts without refreshing or pretending the restore succeeded", async () => {
  mocks.restore.mockImplementation(() => { throw new RestoreError("conflict"); });
  expect(await restorePlatformVersion(input)).toEqual({ error: "conflict" });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
