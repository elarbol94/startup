import { describe, expect, it } from "vitest";
import { platformLinkPath } from "./platform-links";

const origin = "https://startup.example";

describe("platformLinkPath", () => {
  it("opens platform pages in the app", () => {
    expect(platformLinkPath("https://startup.example/projects/p1?task=t1", origin)).toBe("/projects/p1?task=t1");
    expect(platformLinkPath("https://startup.example/wiki/pages/plan#ziele", origin)).toBe("/wiki/pages/plan#ziele");
  });

  it("leaves other links to Element", () => {
    for (const href of [
      "https://matrix.to/#/@anna:banond.com",
      "https://evil.example/projects",
      "https://startup.example/element/#/room/!abc:banond.com",
      "https://startup.example/element",
      "https://startup.example/api/files/1",
      "https://startup.example/share/presentations/token",
      "mailto:anna@example.com",
      "#/room/!abc:banond.com",
      "",
    ]) {
      expect(platformLinkPath(href, origin), href).toBeNull();
    }
  });
});
