import { describe, expect, it } from "vitest";
import { barEdgeAt, barEdgeGrabWidth } from "./portfolio-utils";

describe("barEdgeAt", () => {
  it("resizes from the bar's own start and end edges", () => {
    expect(barEdgeAt(2, 192)).toBe("start");
    expect(barEdgeAt(189, 192)).toBe("end");
  });

  it("moves the bar from its middle", () => {
    expect(barEdgeAt(96, 192)).toBeNull();
    expect(barEdgeAt(20, 192)).toBeNull();
  });

  it("keeps a movable middle on short bars", () => {
    expect(barEdgeGrabWidth(16)).toBe(4);
    expect(barEdgeAt(8, 16)).toBeNull();
    expect(barEdgeAt(1, 16)).toBe("start");
    expect(barEdgeAt(15, 16)).toBe("end");
  });
});
