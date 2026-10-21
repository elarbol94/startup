import { describe, expect, it } from "vitest";
import { loginHref, safeReturnPath } from "./return-path";

describe("safeReturnPath", () => {
  it("keeps in-app paths with their query and hash", () => {
    expect(safeReturnPath("/projects/abc?task=t1")).toBe("/projects/abc?task=t1");
    expect(safeReturnPath("/wiki/pages/plan#ziele")).toBe("/wiki/pages/plan#ziele");
    expect(safeReturnPath("/")).toBe("/");
  });

  it("rejects external, protocol-relative and malformed targets", () => {
    for (const value of [
      "https://evil.example/",
      "//evil.example/x",
      "/\\evil.example",
      "\\\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "javascript:alert(1)",
      "projects",
      "",
      null,
      undefined,
      42,
      `/${"a".repeat(3000)}`,
    ]) {
      expect(safeReturnPath(value), String(value)).toBeNull();
    }
  });

  it("does not return into the sign-in flow or to internals", () => {
    expect(safeReturnPath("/login")).toBeNull();
    expect(safeReturnPath("/login?next=/x")).toBeNull();
    expect(safeReturnPath("/invite?token=x")).toBeNull();
    expect(safeReturnPath("/api/files/1")).toBeNull();
    expect(safeReturnPath("/_next/static/chunk.js")).toBeNull();
    expect(safeReturnPath("/loginhelp")).toBe("/loginhelp");
  });

  it("drops the React Server Component cache parameter", () => {
    expect(safeReturnPath("/calendar?date=2026-10-21&_rsc=1x2y")).toBe("/calendar?date=2026-10-21");
    expect(safeReturnPath("/calendar?_rsc=1x2y")).toBe("/calendar");
  });
});

describe("loginHref", () => {
  it("remembers a worthwhile path", () => {
    expect(loginHref("/projects/abc?task=t1")).toBe("/login?next=%2Fprojects%2Fabc%3Ftask%3Dt1");
  });

  it("falls back to the plain sign-in page", () => {
    expect(loginHref("/")).toBe("/login");
    expect(loginHref(null)).toBe("/login");
    expect(loginHref("//evil.example")).toBe("/login");
  });
});
