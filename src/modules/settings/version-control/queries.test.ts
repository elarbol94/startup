import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), prepare: vi.fn(), list: vi.fn(), preview: vi.fn() }));
vi.mock("@/db", () => ({ sqlite: { prepare: mocks.prepare } }));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("./store", () => ({ listVersions: mocks.list, previewRestore: mocks.preview }));
import { getVersionHistory, getRestorePreview } from "./queries";
beforeEach(() => vi.resetAllMocks());
it.each(["Unauthorized", "Forbidden"])("does not read or disclose historical records to %s callers", async message => {
  mocks.admin.mockRejectedValue(new Error(message));
  await expect(getVersionHistory({})).rejects.toThrow(message);
  await expect(getRestorePreview(1, "before")).rejects.toThrow(message);
  expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.preview).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
});
