import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserOrThrow: vi.fn(),
  loadEntry: vi.fn(),
  hasOverlap: vi.fn(),
  revalidateTime: vi.fn(),
  inserted: [] as unknown[],
  updated: [] as unknown[],
  deleted: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUserOrThrow: mocks.requireUserOrThrow }));
vi.mock("@/db", () => ({
  db: {
    insert: () => ({
      values: (values: unknown) => {
        mocks.inserted.push(values);
        return { returning: () => ({ get: () => ({ id: "new-entry" }) }) };
      },
    }),
    update: () => ({
      set: (values: unknown) => {
        mocks.updated.push(values);
        return { where: () => ({ run: () => undefined }) };
      },
    }),
    delete: () => ({ where: () => ({ run: mocks.deleted }) }),
  },
}));
vi.mock("./action-helpers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./action-helpers")>()),
  loadEntry: mocks.loadEntry,
  hasOverlap: mocks.hasOverlap,
  resolveAssignment: () => ({ projectId: null, taskId: null }),
  revalidateTime: mocks.revalidateTime,
}));

import { deleteTimeEntry, saveTimeEntry } from "./entry-actions";

const admin = { id: "admin", name: "Admin", role: "admin" };
const input = { workDate: "2026-09-24", start: "09:00", end: "12:00", breakMinutes: 0 };
const foreignEntry = { id: "entry-1", userId: "colleague", endedAt: new Date("2026-09-24T10:00:00Z") };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inserted.length = 0;
  mocks.updated.length = 0;
  mocks.requireUserOrThrow.mockResolvedValue(admin);
  mocks.hasOverlap.mockReturnValue(false);
});

describe("time entries are own-time-only, even for admins", () => {
  it("records a new entry for the session user and ignores a foreign userId", async () => {
    const result = await saveTimeEntry({ ...input, userId: "colleague" } as typeof input);
    expect(result).toEqual({ ok: true, id: "new-entry" });
    expect(mocks.inserted).toEqual([expect.objectContaining({ userId: "admin", createdBy: "admin" })]);
    expect(mocks.hasOverlap).toHaveBeenCalledWith("admin", input.workDate, expect.anything(), expect.anything(), undefined);
  });

  it("refuses to edit another user's entry", async () => {
    mocks.loadEntry.mockReturnValue(foreignEntry);
    expect(await saveTimeEntry({ ...input, id: foreignEntry.id })).toEqual({ ok: false, error: "forbidden" });
    expect(mocks.updated).toEqual([]);
    expect(mocks.revalidateTime).not.toHaveBeenCalled();
  });

  it("refuses to delete another user's entry", async () => {
    mocks.loadEntry.mockReturnValue(foreignEntry);
    expect(await deleteTimeEntry(foreignEntry.id)).toEqual({ ok: false, error: "forbidden" });
    expect(mocks.deleted).not.toHaveBeenCalled();
  });

  it("still lets users edit and delete their own entries", async () => {
    mocks.loadEntry.mockReturnValue({ ...foreignEntry, userId: "admin" });
    expect(await saveTimeEntry({ ...input, id: foreignEntry.id })).toEqual({ ok: true, id: foreignEntry.id });
    expect(await deleteTimeEntry(foreignEntry.id)).toEqual({ ok: true });
    expect(mocks.deleted).toHaveBeenCalledTimes(1);
  });
});
