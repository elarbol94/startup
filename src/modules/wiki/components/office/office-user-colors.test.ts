import { describe, expect, it, vi } from "vitest";
import { getUserMarkColor } from "@/lib/user-mark-colors";
import { applyOfficeUserColors, buildOfficeColorResolver } from "./office-user-colors";

const color = (key: string) => Number.parseInt(getUserMarkColor(key).solid.slice(1), 16);

const people = [
  { id: "ab", name: "Anna", markColor: "red" },
  { id: "abc", name: "Ben", markColor: "blue" },
  { id: "x1", name: "Same", markColor: "green" },
  { id: "x2", name: "Same", markColor: "teal" },
];

describe("buildOfficeColorResolver", () => {
  const resolve = buildOfficeColorResolver(people);

  it("matches plain ids and co-editing connection ids", () => {
    expect(resolve("ab")).toBe(color("red"));
    expect(resolve("abc")).toBe(color("blue"));
    expect(resolve("abc12")).toBe(color("blue"));
    expect(resolve("ab3")).toBe(color("red"));
  });

  it("does not treat other ids as connection ids", () => {
    expect(resolve("abd1")).toBeNull();
    expect(resolve("abcx")).toBeNull();
  });

  it("falls back to a unique display name", () => {
    expect(resolve("unknown", "Anna")).toBe(color("red"));
    expect(resolve(null, "Same")).toBeNull();
    expect(resolve("unknown", "Nobody")).toBeNull();
  });
});

function fakeFrame(asc: unknown) {
  return { contentWindow: { AscCommon: asc } } as unknown as HTMLIFrameElement;
}

describe("applyOfficeUserColors", () => {
  it("seeds the editor cache and wraps the lookup once", () => {
    const setUserColorById = vi.fn();
    const original = vi.fn(() => "color");
    const asc: Record<string, unknown> = { setUserColorById, getUserColorById: original };

    expect(applyOfficeUserColors(fakeFrame(asc), people)).toBe(true);
    expect(setUserColorById).toHaveBeenCalledWith("ab", color("red"));
    expect(setUserColorById).toHaveBeenCalledWith("Anna", color("red"));
    expect(setUserColorById).not.toHaveBeenCalledWith("Same", expect.anything());

    const wrapped = asc.getUserColorById as (...args: unknown[]) => unknown;
    expect(wrapped).not.toBe(original);
    expect(wrapped("abc7", "Ben", true, false)).toBe("color");
    expect(setUserColorById).toHaveBeenCalledWith("abc7", color("blue"));
    expect(original).toHaveBeenCalledWith("abc7", "Ben", true, false);

    applyOfficeUserColors(fakeFrame(asc), [{ id: "abc", name: "Ben", markColor: "lime" }]);
    expect(asc.getUserColorById).toBe(wrapped);
    wrapped("abc7", "Ben", true, false);
    expect(setUserColorById).toHaveBeenLastCalledWith("abc7", color("lime"));
  });

  it("does nothing without the editor internals", () => {
    expect(applyOfficeUserColors(null, people)).toBe(false);
    expect(applyOfficeUserColors(fakeFrame(undefined), people)).toBe(false);
    expect(applyOfficeUserColors(fakeFrame({ getUserColorById: () => 0 }), people)).toBe(false);
  });
});
