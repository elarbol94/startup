import { describe, expect, it } from "vitest";
import { fromDoc, toDoc } from "../collaboration/rich-text";
import { presentationElementSchema, presentationSettingsSchema } from "./presentation-model";
import { arrowHeadPath, arrowHeadSize, dashArray, gradientVector, lineCap, shadowOffset } from "./presentation-paint";
import { BULLET_GALLERY, NUMBERING_GALLERY, effectiveParagraphs, formatNumber, paragraphIndent, paragraphMarkers, shiftLevel, updateParagraphs } from "./presentation-paragraphs";
import { POWERPOINT_PATTERNS, patternTilePath } from "./powerpoint-patterns";
import { QUICK_STYLES, WORDART_STYLES, applyQuickStyle } from "./powerpoint-quick-styles";
import { defaultGradient, themeColorGrid, withBrightness } from "./powerpoint-theme";
import { wordArtCss } from "./presentation-text-style";

describe("PowerPoint theme colours", () => {
  it("reproduces the default gradient PowerPoint read back for Accent 1", () => {
    // COM read-back: F0F8FD @0, 74C4E9 @0.74 and @0.83, A2D8F0 @1 (brightness 0.95, 0.55, 0.7).
    const stops = defaultGradient("#156082").stops;
    expect(stops.map((s) => s.position)).toEqual([0, 0.74, 0.83, 1]);
    const near = (a: string, b: string) => [0, 2, 4].every((i) => Math.abs(parseInt(a.slice(1 + i, 3 + i), 16) - parseInt(b.slice(i, i + 2), 16)) <= 2);
    expect(near(stops[0].color, "F0F8FD")).toBe(true);
    expect(near(stops[1].color, "74C4E9")).toBe(true);
    expect(near(stops[3].color, "A2D8F0")).toBe(true);
  });
  it("builds the 6 × 10 picker grid with PowerPoint's names", () => {
    const grid = themeColorGrid();
    expect(grid).toHaveLength(6);
    expect(grid[0][4]).toEqual({ color: "#156082", name: "Dark Teal, Accent 1" });
    expect(grid[1][0].name).toBe("White, Background 1, Darker 5%");
    expect(grid[5][1].name).toBe("Black, Text 1, Lighter 5%");
    expect(grid[4][4].name).toBe("Dark Teal, Accent 1, Darker 25%");
    expect(withBrightness("#000000", 0.5)).toBe("#808080");
  });
});

describe("paint maths", () => {
  it("scales dash patterns by the line width and rounds dots", () => {
    expect(dashArray("dash", 2)).toBe("8 6");
    expect(dashArray("solid", 2)).toBeUndefined();
    expect(lineCap("roundDot", "flat")).toBe("round");
    expect(lineCap("dash", undefined)).toBe("butt");
  });
  it("runs a 90° gradient from top to bottom and offsets shadows clockwise", () => {
    expect(gradientVector(90, 200, 100)).toEqual({ x1: 100, y1: 0, x2: 100, y2: 100 });
    expect(shadowOffset(90, 3)).toEqual({ dx: 0, dy: 3 });
  });
  it("sizes arrowheads in line widths and centres diamonds on the end", () => {
    expect(arrowHeadSize(2, { width: "lg", length: "sm" })).toEqual({ width: 10, length: 4 });
    expect(arrowHeadPath("diamond", { x: 10, y: 0 }, { x: 0, y: 0 }, { width: 4, length: 4 })?.inset).toBe(0);
    expect(arrowHeadPath("triangle", { x: 10, y: 0 }, { x: 0, y: 0 }, { width: 4, length: 4 })?.inset).toBe(4);
  });
  it("has the 48 patterns of the Format pane, each an 8 × 8 tile", () => {
    expect(Object.keys(POWERPOINT_PATTERNS)).toHaveLength(48);
    expect(patternTilePath("pct5").match(/M/g)).toHaveLength(2);
    expect(patternTilePath("solidDmnd").length).toBeGreaterThan(0);
  });
});

describe("paragraphs", () => {
  it("numbers per level, continuing past deeper levels", () => {
    const n = { kind: "number" as const, scheme: "arabicPeriod" as const };
    const markers = paragraphMarkers([{ bullet: n }, { bullet: { kind: "char", char: "•" }, level: 1 }, { bullet: n }, {}, { bullet: n }]);
    expect(markers.map((m) => m?.text ?? null)).toEqual(["1.", "•", "2.", null, "1."]);
    expect(formatNumber("romanLcPeriod", 4)).toBe("iv.");
    expect(formatNumber("alphaUcPeriod", 27)).toBe("AA.");
  });
  it("matches the galleries and indents bullets by level", () => {
    expect(BULLET_GALLERY.map((b) => b.id)).toEqual(["none", "filledRound", "hollowRound", "filledSquare", "hollowSquare", "star", "arrow", "checkmark"]);
    expect(NUMBERING_GALLERY.map((b) => b.label)).toEqual(["", "1. 2. 3.", "1) 2) 3)", "I. II. III.", "A. B. C.", "a) b) c)", "a. b. c.", "i. ii. iii."]);
    expect(paragraphIndent({ bullet: { kind: "char", char: "•" }, level: 1 })).toEqual({ marginLeft: 54, textIndent: -18 });
    expect(shiftLevel({ level: 8 }, 1).level).toBe(8);
    expect(shiftLevel({ level: 1 }, -1).level).toBeUndefined();
  });
  it("folds the old whole-box list setting in and fills the paragraph array", () => {
    expect(effectiveParagraphs(2, undefined, "number")[1].bullet).toEqual({ kind: "number", scheme: "arabicPeriod" });
    expect(updateParagraphs(undefined, 3, [2], (p) => ({ ...p, spaceBefore: 6 }))).toEqual([{}, {}, { spaceBefore: 6 }]);
  });
});

describe("rich text round trip", () => {
  it("keeps paragraph formats and the new character formatting", () => {
    const content = {
      text: "One\nTwo", paragraphs: [{ bullet: { kind: "char" as const, char: "•" } }, { level: 1, spaceBefore: 6 }],
      runs: [{ text: "One", strike: "double" as const, baseline: 30 }, { text: "\nTwo", highlight: "#FFFF00", spacing: 3, size: 20, caps: "small" as const }],
    };
    const back = fromDoc(toDoc(content));
    expect(back.paragraphs).toEqual(content.paragraphs);
    expect(back.runs?.[0]).toMatchObject({ text: "One", strike: "double", baseline: 30 });
    expect(back.runs?.[2]).toMatchObject({ text: "Two", highlight: "#FFFF00", spacing: 3, size: 20, caps: "small" });
  });
  it("leaves unformatted text exactly as before", () => {
    const back = fromDoc(toDoc({ text: "Plain", runs: [{ text: "Plain" }] }));
    expect(back.paragraphs).toBeUndefined();
    expect(back.runs).toEqual([{ text: "Plain", color: undefined, bold: false, italic: false, underline: false, href: undefined }]);
  });
});

describe("Quick Styles, WordArt and the model", () => {
  it("has PowerPoint's 77 shape styles and 20 WordArt styles", () => {
    expect(QUICK_STYLES).toHaveLength(77);
    expect(QUICK_STYLES[8]).toMatchObject({ id: "coloredFill-accent1", fill: "#156082", line: "#042433", text: "#FFFFFF" });
    expect(WORDART_STYLES).toHaveLength(20);
  });
  it("applies a style's fill, line, shadow and text colour", () => {
    const intense = QUICK_STYLES.find((s) => s.id === "intenseEffect-accent1")!;
    const content = applyQuickStyle({ shape: "rect", fill: "#fff", stroke: "#000", strokeWidth: 1, opacity: 1, runs: [{ text: "A", color: "#f00" }] }, intense);
    expect(content.fillStyle?.type).toBe("gradient");
    expect(content.strokeWidth).toBe(0);
    expect(content.effects?.shadow).toMatchObject({ type: "outer", blur: 4.5, distance: 1.5, angle: 90 });
    expect(content.runs?.[0].color).toBeUndefined();
    expect(content.color).toBe("#FFFFFF");
  });
  it("parses shapes with every new field, and old settings get the view defaults", () => {
    const parsed = presentationElementSchema.parse({
      id: "s", type: "shape", x: 0, y: 0, width: 100, height: 100, rotation: 0,
      content: { shape: "rect", fill: "#fff", fillStyle: { type: "pattern", pattern: "wave", foreground: "#000", background: "#fff" }, dash: "longDashDot", compound: "triple", endHead: "stealth",
        effects: { glow: { color: "#f00", size: 5, transparency: 0.4 }, rotation3d: { x: 20, y: 0, z: 0, perspective: 45 } },
        body: { anchor: "bottom", autofit: "shrink", columns: 2 }, textStyle: WORDART_STYLES[6] },
    });
    expect(parsed.type).toBe("shape");
    const settings = presentationSettingsSchema.parse({ defaultStepDurationMs: 4000 });
    expect(settings.grid).toEqual({ spacing: 28.35, snap: false, show: false });
    expect(settings.guides.smart).toBe(true);
  });
  it("turns WordArt into CSS", () => {
    const css = wordArtCss(WORDART_STYLES[5]);
    expect(css.backgroundImage).toContain("linear-gradient(180deg");
    expect(css.color).toBe("transparent");
    expect(wordArtCss(WORDART_STYLES[8]).textShadow).toContain("0 0 3px");
  });
});
