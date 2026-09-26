import { describe, expect, it } from "vitest";
import { projectIdFromPath, withProjectParam } from "./current-project";

describe("current project", () => {
  it("reads the project id from project routes only", () => {
    expect(projectIdFromPath("/projects/abc")).toBe("abc");
    expect(projectIdFromPath("/projects/a%20b?view=knowledge")).toBe("a b");
    expect(projectIdFromPath("/projects")).toBeNull();
    expect(projectIdFromPath("/calendar")).toBeNull();
    expect(projectIdFromPath(null)).toBeNull();
  });

  it("appends the project parameter to internal links", () => {
    expect(withProjectParam("/time", "p1")).toBe("/time?project=p1");
    expect(withProjectParam("/calendar?new=event", "p 1")).toBe("/calendar?new=event&project=p%201");
    expect(withProjectParam("/calendar?new=event", null)).toBe("/calendar?new=event");
  });
});
