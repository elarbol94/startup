import { describe, expect, it } from "vitest";
import {
  DEFAULT_USER_MARK_COLOR,
  USER_MARK_COLORS,
  getUserMarkColor,
  identityVariable,
  userIdentityColor,
  initialsForName,
  isUserMarkColor,
  userMarkColorStyle,
} from "./user-mark-colors";

describe("personal user marking colors", () => {
  it("provides sixteen unique palette tokens and solid colors", () => {
    expect(USER_MARK_COLORS).toHaveLength(16);
    expect(new Set(USER_MARK_COLORS.map((color) => color.key)).size).toBe(16);
    expect(new Set(USER_MARK_COLORS.map((color) => color.solid)).size).toBe(16);
  });

  it("accepts only palette keys and falls back safely", () => {
    expect(isUserMarkColor("indigo")).toBe(true);
    expect(isUserMarkColor("yellow")).toBe(false);
    expect(getUserMarkColor("damaged").key).toBe(DEFAULT_USER_MARK_COLOR);
  });

  it("exposes the shared CSS identity variables", () => {
    expect(userMarkColorStyle("teal")).toMatchObject({
      "--user-mark-solid": expect.any(String),
      "--user-mark-highlight": expect.any(String),
      "--user-mark-hover": expect.any(String),
      "--user-mark-dark": expect.any(String),
    });
  });
});

describe("platform identity", () => {
  it("keeps historical colors as fallbacks but resolves the current author color", () => {
    expect(userMarkColorStyle("rose", "alice")["--user-mark-solid" as keyof ReturnType<typeof userMarkColorStyle>])
      .toBe(`var(${identityVariable("alice", "solid")}, ${getUserMarkColor("rose").solid})`);
    expect(userIdentityColor("bob")).not.toBe(userIdentityColor("alice"));
  });
  it("encodes unsafe IDs without collisions or CSS injection", () => {
    const ids = ["a-b", "ab", "a b", "</style><script>", "ä", "😀"];
    const variables = ids.map(id => identityVariable(id, "solid"));
    expect(new Set(variables).size).toBe(ids.length);
    variables.forEach(variable => expect(variable).toMatch(/^--identity-[0-9a-f-]+-solid$/));
  });
  it("retains readable initials even for whitespace and missing names", () => {
    expect(initialsForName("  Anna   Berger ")).toBe("AB");
    expect(initialsForName("")).toBe("?");
  });
  it("keeps white avatar initials readable across the complete palette", () => {
    for (const color of USER_MARK_COLORS) {
      const channels = color.solid.slice(1).match(/../g)!.map(hex => parseInt(hex, 16) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      expect(1.05 / (luminance + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
