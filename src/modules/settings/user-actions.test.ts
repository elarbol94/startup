import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revokeInvitation: vi.fn(), removeUserAccount: vi.fn(), requireAdmin: vi.fn(), issueInvitation: vi.fn(), acceptInvitation: vi.fn(), revalidatePath: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("./user-removal", () => ({ removeUserAccount: mocks.removeUserAccount }));
vi.mock("./invitations", () => ({ revokeInvitation: mocks.revokeInvitation, issueInvitation: mocks.issueInvitation, acceptInvitation: mocks.acceptInvitation }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }));

import { invitePlatformUser, removePlatformUser, revokePlatformInvitation } from "./user-actions";
const input = { email: "colleague@example.com", role: "member" as const };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "admin" });
  mocks.issueInvitation.mockResolvedValue({ error: null });
});

describe("invitePlatformUser", () => {
  it.each(["Unauthorized", "Forbidden"])("rejects %s callers before sending an invitation", async (message) => {
    mocks.requireAdmin.mockRejectedValue(new Error(message));
    await expect(invitePlatformUser(input)).rejects.toThrow(message);
    expect(mocks.issueInvitation).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each([{ email: "invalid" }, { email: "a@example.com\r\nBcc: b@example.com" }, { role: "superadmin" }])("rejects invalid invitation data: %j", async (invalid) => {
    expect(await invitePlatformUser({ ...input, ...invalid } as typeof input)).toEqual({ error: "invalidInput" });
    expect(mocks.issueInvitation).not.toHaveBeenCalled();
  });

  it.each(["member", "personnel", "admin"] as const)("stores the selected %s role and normalizes email", async (role) => {
    expect(await invitePlatformUser({ ...input, role, email: " Colleague@Example.com " })).toEqual({ error: null });
    expect(mocks.issueInvitation).toHaveBeenCalledWith({ email: input.email, role }, "admin", "en");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings/users");
  });

  it.each(["emailTaken", "mailNotConfigured", "mailFailed"])("returns the %s delivery error without reporting success", async (error) => {
    mocks.issueInvitation.mockResolvedValue({ error });
    expect(await invitePlatformUser(input)).toEqual({ error });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("removePlatformUser", () => {
  it("requires administrator access before attempting removal", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Forbidden"));
    await expect(removePlatformUser({ userId: "member" })).rejects.toThrow("Forbidden");
    expect(mocks.removeUserAccount).not.toHaveBeenCalled();
  });
  it("rejects malformed IDs without touching an account", async () => {
    expect(await removePlatformUser({ userId: " " })).toEqual({ error: "invalidRemoval" });
    expect(mocks.removeUserAccount).not.toHaveBeenCalled();
  });
  it("passes the authenticated admin to removal and refreshes affected views", async () => {
    mocks.removeUserAccount.mockReturnValue({ error: null });
    expect(await removePlatformUser({ userId: "member" })).toEqual({ error: null });
    expect(mocks.removeUserAccount).toHaveBeenCalledWith("member", "admin");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
  it("keeps protected-account errors visible without reporting success", async () => {
    mocks.removeUserAccount.mockReturnValue({ error: "cannotRemoveSelf" });
    expect(await removePlatformUser({ userId: "admin" })).toEqual({ error: "cannotRemoveSelf" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("revokePlatformInvitation", () => {
  it("requires admin access before revoking a link", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Forbidden"));
    await expect(revokePlatformInvitation({ invitationId: "test" })).rejects.toThrow("Forbidden");
    expect(mocks.revokeInvitation).not.toHaveBeenCalled();
  });
  it("validates the invitation ID", async () => {
    expect(await revokePlatformInvitation({ invitationId: " " })).toEqual({ error: "invitationUnavailable" });
    expect(mocks.revokeInvitation).not.toHaveBeenCalled();
  });
  it("uses the authenticated administrator and refreshes only after success", async () => {
    mocks.revokeInvitation.mockReturnValue({ error: null });
    expect(await revokePlatformInvitation({ invitationId: "test" })).toEqual({ error: null });
    expect(mocks.revokeInvitation).toHaveBeenCalledWith("test", "admin");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings/users");
  });
});
