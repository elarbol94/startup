import { describe, expect, it } from "vitest";
import { compactStorageKey, storedCollapsed } from "./compact-layout";

describe("compact layout preferences", () => {
  it("keeps the original key for wide screens and a separate one for laptops", () => {
    expect(compactStorageKey("rail", false)).toBe("rail");
    expect(compactStorageKey("rail", true)).toBe("rail:compact");
  });

  it("collapses on laptops only until the user chooses", () => {
    expect(storedCollapsed(null, true)).toBe(true);
    expect(storedCollapsed(null, false)).toBe(false);
    expect(storedCollapsed("false", true)).toBe(false);
    expect(storedCollapsed("true", false)).toBe(true);
  });

  it("reads the calendar's legacy 1/0 values", () => {
    expect(storedCollapsed("1", false)).toBe(true);
    expect(storedCollapsed("0", true)).toBe(false);
  });
});
