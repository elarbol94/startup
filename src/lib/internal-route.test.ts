import { expect, it } from "vitest";
import { safeInternalRoute } from "./internal-route";

it("accepts app paths and rejects anything that leaves the origin", () => {
  expect(safeInternalRoute("/wiki/pages/a?section=b#c")).toBe("/wiki/pages/a?section=b#c");
  for (const route of ["//evil.com", "/\\evil.com", "/\\/evil.com", "/\t/evil.com", "https://evil.com", "evil"]) {
    expect(() => safeInternalRoute(route), route).toThrow();
  }
});
