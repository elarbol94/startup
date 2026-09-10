import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), identities: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUserOrThrow: mocks.requireUser }));
vi.mock("./queries", () => ({ listUserIdentities: mocks.identities }));
import { getUserIdentities } from "./identity-actions";

beforeEach(() => vi.resetAllMocks());
it("does not disclose identities to unauthenticated callers", async () => {
  mocks.requireUser.mockRejectedValue(new Error("Unauthorized"));
  await expect(getUserIdentities()).rejects.toThrow("Unauthorized");
  expect(mocks.identities).not.toHaveBeenCalled();
});
it("reads the current palette on each refresh, including changed account colors", async () => {
  mocks.requireUser.mockResolvedValue({ id: "alice" });
  mocks.identities.mockReturnValueOnce([{ id: "alice", markColor: "rose" }])
    .mockReturnValueOnce([{ id: "alice", markColor: "teal" }]);
  expect(await getUserIdentities()).toEqual([{ id: "alice", markColor: "rose" }]);
  expect(await getUserIdentities()).toEqual([{ id: "alice", markColor: "teal" }]);
});
