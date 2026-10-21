// PowerPoint's Shape Quick Styles and WordArt gallery, with the values read back from desktop
// PowerPoint by applying each style through COM (Shape.ShapeStyle = 1..77 and
// TextFrame2.WordArtformat = 30..49); see docs/plans/presentation-powerpoint-formatting.md.
import type { PresentationElement } from "./presentation-model";
import type { PresentationTextStyle } from "./presentation-format-model";
import { POWERPOINT_PATTERNS } from "./powerpoint-patterns";

type ShapeContent = Extract<PresentationElement, { type: "shape" }>["content"];
type Shadow = { blur: number; distance: number; angle: number; transparency: number; color: string };
export type QuickStyle = {
  id: string; fill?: string | null; fillTransparency?: number;
  gradient?: { angle: number; stops: [string, number][] };
  line: string | null; lineWidth?: number; shadow?: Shadow; text: string;
};

/** The gallery's rows, in order: six Theme Styles rows, then five Presets rows; seven colours each. */
export const QUICK_STYLE_ROWS = ["coloredOutline", "coloredFill", "light1Outline", "subtleEffect", "moderateEffect", "intenseEffect", "transparent", "transparentOutline", "semitransparent", "coloredFillNoOutline", "gradientNoOutline"] as const;
export const QUICK_STYLE_THEME_ROWS = 6;
export const QUICK_STYLE_COLUMNS = ["tx1", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6"] as const;

export const QUICK_STYLES: QuickStyle[] = [
  {id: "coloredOutline-tx1", fill: "#FFFFFF", line: "#000000", lineWidth: 1.5, text: "#000000"},
  {id: "coloredOutline-accent1", fill: "#FFFFFF", line: "#156082", lineWidth: 1.5, text: "#000000"},
  {id: "coloredOutline-accent2", fill: "#FFFFFF", line: "#E97132", lineWidth: 1.5, text: "#000000"},
  {id: "coloredOutline-accent3", fill: "#FFFFFF", line: "#196B24", lineWidth: 1.5, text: "#000000"},
  {id: "coloredOutline-accent4", fill: "#FFFFFF", line: "#0F9ED5", lineWidth: 1.5, text: "#000000"},
  {id: "coloredOutline-accent5", fill: "#FFFFFF", line: "#A02B93", lineWidth: 1.5, text: "#000000"},
  {id: "coloredOutline-accent6", fill: "#FFFFFF", line: "#4EA72E", lineWidth: 1.5, text: "#000000"},
  {id: "coloredFill-tx1", fill: "#000000", line: "#000000", lineWidth: 1.5, text: "#FFFFFF"},
  {id: "coloredFill-accent1", fill: "#156082", line: "#042433", lineWidth: 1.5, text: "#FFFFFF"},
  {id: "coloredFill-accent2", fill: "#E97132", line: "#622C0F", lineWidth: 1.5, text: "#FFFFFF"},
  {id: "coloredFill-accent3", fill: "#196B24", line: "#052909", lineWidth: 1.5, text: "#FFFFFF"},
  {id: "coloredFill-accent4", fill: "#0F9ED5", line: "#024059", lineWidth: 1.5, text: "#FFFFFF"},
  {id: "coloredFill-accent5", fill: "#A02B93", line: "#410C3B", lineWidth: 1.5, text: "#FFFFFF"},
  {id: "coloredFill-accent6", fill: "#4EA72E", line: "#1C440D", lineWidth: 1.5, text: "#FFFFFF"},
  {id: "light1Outline-tx1", fill: "#000000", line: "#FFFFFF", lineWidth: 2.0, text: "#FFFFFF"},
  {id: "light1Outline-accent1", fill: "#156082", line: "#FFFFFF", lineWidth: 2.0, text: "#FFFFFF"},
  {id: "light1Outline-accent2", fill: "#E97132", line: "#FFFFFF", lineWidth: 2.0, text: "#FFFFFF"},
  {id: "light1Outline-accent3", fill: "#196B24", line: "#FFFFFF", lineWidth: 2.0, text: "#FFFFFF"},
  {id: "light1Outline-accent4", fill: "#0F9ED5", line: "#FFFFFF", lineWidth: 2.0, text: "#FFFFFF"},
  {id: "light1Outline-accent5", fill: "#A02B93", line: "#FFFFFF", lineWidth: 2.0, text: "#FFFFFF"},
  {id: "light1Outline-accent6", fill: "#4EA72E", line: "#FFFFFF", lineWidth: 2.0, text: "#FFFFFF"},
  {id: "subtleEffect-tx1", gradient: {angle: 90, stops: [["#9B9B9B", 0.0], ["#8E8E8E", 0.5], ["#797979", 1.0]]}, line: "#000000", lineWidth: 1.0, text: "#000000"},
  {id: "subtleEffect-accent1", gradient: {angle: 90, stops: [["#9CAFBF", 0.0], ["#8FA3B4", 0.5], ["#7A95AB", 1.0]]}, line: "#156082", lineWidth: 1.0, text: "#000000"},
  {id: "subtleEffect-accent2", gradient: {angle: 90, stops: [["#F5B8A4", 0.0], ["#F2AB96", 0.5], ["#F59E81", 1.0]]}, line: "#E97132", lineWidth: 1.0, text: "#000000"},
  {id: "subtleEffect-accent3", gradient: {angle: 90, stops: [["#9DB49E", 0.0], ["#90A891", 0.5], ["#7B9C7D", 1.0]]}, line: "#196B24", lineWidth: 1.0, text: "#000000"},
  {id: "subtleEffect-accent4", gradient: {angle: 90, stops: [["#9CCFF5", 0.0], ["#8FC4EB", 0.5], ["#79BEED", 1.0]]}, line: "#0F9ED5", lineWidth: 1.0, text: "#000000"},
  {id: "subtleEffect-accent5", gradient: {angle: 90, stops: [["#D09FC8", 0.0], ["#C692BE", 0.5], ["#C17EB6", 1.0]]}, line: "#A02B93", lineWidth: 1.0, text: "#000000"},
  {id: "subtleEffect-accent6", gradient: {angle: 90, stops: [["#A8D5A0", 0.0], ["#9BCA93", 0.5], ["#8AC67E", 1.0]]}, line: "#4EA72E", lineWidth: 1.0, text: "#000000"},
  {id: "moderateEffect-tx1", gradient: {angle: 90, stops: [["#454545", 0.0], ["#000000", 0.5], ["#000000", 1.0]]}, line: "#000000", lineWidth: 1.0, text: "#FFFFFF"},
  {id: "moderateEffect-accent1", gradient: {angle: 90, stops: [["#497491", 0.0], ["#106287", 0.5], ["#08587C", 1.0]]}, line: "#156082", lineWidth: 1.0, text: "#FFFFFF"},
  {id: "moderateEffect-accent2", gradient: {angle: 90, stops: [["#ED8256", 0.0], ["#F26E29", 0.5], ["#E15E19", 1.0]]}, line: "#E97132", lineWidth: 1.0, text: "#FFFFFF"},
  {id: "moderateEffect-accent3", gradient: {angle: 90, stops: [["#4A7E4E", 0.0], ["#156F21", 0.5], ["#0E6519", 1.0]]}, line: "#196B24", lineWidth: 1.0, text: "#FFFFFF"},
  {id: "moderateEffect-accent4", gradient: {angle: 90, stops: [["#47AADF", 0.0], ["#05A2DF", 0.5], ["#0094CE", 1.0]]}, line: "#0F9ED5", lineWidth: 1.0, text: "#FFFFFF"},
  {id: "moderateEffect-accent5", gradient: {angle: 90, stops: [["#AC51A0", 0.0], ["#A62598", 0.5], ["#981B8A", 1.0]]}, line: "#A02B93", lineWidth: 1.0, text: "#FFFFFF"},
  {id: "moderateEffect-accent6", gradient: {angle: 90, stops: [["#66B352", 0.0], ["#4BAD28", 0.5], ["#3F9E1D", 1.0]]}, line: "#4EA72E", lineWidth: 1.0, text: "#FFFFFF"},
  {id: "intenseEffect-tx1", gradient: {angle: 90, stops: [["#454545", 0.0], ["#000000", 0.5], ["#000000", 1.0]]}, line: null, shadow: {blur: 4.5, distance: 1.5, angle: 90, transparency: 0.37, color: "#000000"}, text: "#FFFFFF"},
  {id: "intenseEffect-accent1", gradient: {angle: 90, stops: [["#497491", 0.0], ["#106287", 0.5], ["#08587C", 1.0]]}, line: null, shadow: {blur: 4.5, distance: 1.5, angle: 90, transparency: 0.37, color: "#000000"}, text: "#FFFFFF"},
  {id: "intenseEffect-accent2", gradient: {angle: 90, stops: [["#ED8256", 0.0], ["#F26E29", 0.5], ["#E15E19", 1.0]]}, line: null, shadow: {blur: 4.5, distance: 1.5, angle: 90, transparency: 0.37, color: "#000000"}, text: "#FFFFFF"},
  {id: "intenseEffect-accent3", gradient: {angle: 90, stops: [["#4A7E4E", 0.0], ["#156F21", 0.5], ["#0E6519", 1.0]]}, line: null, shadow: {blur: 4.5, distance: 1.5, angle: 90, transparency: 0.37, color: "#000000"}, text: "#FFFFFF"},
  {id: "intenseEffect-accent4", gradient: {angle: 90, stops: [["#47AADF", 0.0], ["#05A2DF", 0.5], ["#0094CE", 1.0]]}, line: null, shadow: {blur: 4.5, distance: 1.5, angle: 90, transparency: 0.37, color: "#000000"}, text: "#FFFFFF"},
  {id: "intenseEffect-accent5", gradient: {angle: 90, stops: [["#AC51A0", 0.0], ["#A62598", 0.5], ["#981B8A", 1.0]]}, line: null, shadow: {blur: 4.5, distance: 1.5, angle: 90, transparency: 0.37, color: "#000000"}, text: "#FFFFFF"},
  {id: "intenseEffect-accent6", gradient: {angle: 90, stops: [["#66B352", 0.0], ["#4BAD28", 0.5], ["#3F9E1D", 1.0]]}, line: null, shadow: {blur: 4.5, distance: 1.5, angle: 90, transparency: 0.37, color: "#000000"}, text: "#FFFFFF"},
  {id: "transparent-tx1", fill: null, line: null, text: "#000000"},
  {id: "transparent-accent1", fill: null, line: null, text: "#156082"},
  {id: "transparent-accent2", fill: null, line: null, text: "#E97132"},
  {id: "transparent-accent3", fill: null, line: null, text: "#196B24"},
  {id: "transparent-accent4", fill: null, line: null, text: "#0F9ED5"},
  {id: "transparent-accent5", fill: null, line: null, text: "#A02B93"},
  {id: "transparent-accent6", fill: null, line: null, text: "#4EA72E"},
  {id: "transparentOutline-tx1", fill: null, line: "#000000", lineWidth: 0.75, text: "#000000"},
  {id: "transparentOutline-accent1", fill: null, line: "#156082", lineWidth: 0.75, text: "#156082"},
  {id: "transparentOutline-accent2", fill: null, line: "#E97132", lineWidth: 0.75, text: "#E97132"},
  {id: "transparentOutline-accent3", fill: null, line: "#196B24", lineWidth: 0.75, text: "#196B24"},
  {id: "transparentOutline-accent4", fill: null, line: "#0F9ED5", lineWidth: 0.75, text: "#0F9ED5"},
  {id: "transparentOutline-accent5", fill: null, line: "#A02B93", lineWidth: 0.75, text: "#A02B93"},
  {id: "transparentOutline-accent6", fill: null, line: "#4EA72E", lineWidth: 0.75, text: "#4EA72E"},
  {id: "semitransparent-tx1", fill: "#000000", fillTransparency: 0.5, line: null, text: "#FFFFFF"},
  {id: "semitransparent-accent1", fill: "#156082", fillTransparency: 0.5, line: null, text: "#FFFFFF"},
  {id: "semitransparent-accent2", fill: "#E97132", fillTransparency: 0.5, line: null, text: "#FFFFFF"},
  {id: "semitransparent-accent3", fill: "#196B24", fillTransparency: 0.5, line: null, text: "#FFFFFF"},
  {id: "semitransparent-accent4", fill: "#0F9ED5", fillTransparency: 0.5, line: null, text: "#FFFFFF"},
  {id: "semitransparent-accent5", fill: "#A02B93", fillTransparency: 0.5, line: null, text: "#FFFFFF"},
  {id: "semitransparent-accent6", fill: "#4EA72E", fillTransparency: 0.5, line: null, text: "#FFFFFF"},
  {id: "coloredFillNoOutline-tx1", fill: "#000000", line: null, text: "#FFFFFF"},
  {id: "coloredFillNoOutline-accent1", fill: "#156082", line: null, text: "#FFFFFF"},
  {id: "coloredFillNoOutline-accent2", fill: "#E97132", line: null, text: "#FFFFFF"},
  {id: "coloredFillNoOutline-accent3", fill: "#196B24", line: null, text: "#FFFFFF"},
  {id: "coloredFillNoOutline-accent4", fill: "#0F9ED5", line: null, text: "#FFFFFF"},
  {id: "coloredFillNoOutline-accent5", fill: "#A02B93", line: null, text: "#FFFFFF"},
  {id: "coloredFillNoOutline-accent6", fill: "#4EA72E", line: null, text: "#FFFFFF"},
  {id: "gradientNoOutline-tx1", gradient: {angle: 270, stops: [["#000000", 0.0], ["#080808", 0.48], ["#666666", 1.0]]}, line: null, text: "#FFFFFF"},
  {id: "gradientNoOutline-accent1", gradient: {angle: 270, stops: [["#0E4057", 0.0], ["#16678B", 0.48], ["#46B1E1", 1.0]]}, line: null, text: "#FFFFFF"},
  {id: "gradientNoOutline-accent2", gradient: {angle: 270, stops: [["#AB4712", 0.0], ["#EA7538", 0.48], ["#F2AA84", 1.0]]}, line: null, text: "#FFFFFF"},
  {id: "gradientNoOutline-accent3", gradient: {angle: 270, stops: [["#114818", 0.0], ["#1B7427", 0.48], ["#47D45A", 1.0]]}, line: null, text: "#FFFFFF"},
  {id: "gradientNoOutline-accent4", gradient: {angle: 270, stops: [["#0A6A8F", 0.0], ["#10A4DD", 0.48], ["#61CBF4", 1.0]]}, line: null, text: "#FFFFFF"},
  {id: "gradientNoOutline-accent5", gradient: {angle: 270, stops: [["#6B1D62", 0.0], ["#A72D9A", 0.48], ["#D86ECC", 1.0]]}, line: null, text: "#FFFFFF"},
  {id: "gradientNoOutline-accent6", gradient: {angle: 270, stops: [["#34701F", 0.0], ["#51AE30", 0.48], ["#8ED973", 1.0]]}, line: null, text: "#FFFFFF"}
];

/** A shape's content with a Quick Style applied: fill, line and shadow replaced, text recoloured. */
export function applyQuickStyle(content: ShapeContent, style: QuickStyle): ShapeContent {
  const { fillStyle: _fillStyle, fillTransparency: _fillTransparency, effects, ...rest } = content;
  void _fillStyle; void _fillTransparency;
  const next: ShapeContent = {
    ...rest, fill: style.fill ?? (style.gradient ? style.gradient.stops[0][0] : ""),
    stroke: style.line ?? "", strokeWidth: style.line ? style.lineWidth ?? 1.5 : 0, color: style.text,
    runs: content.runs?.map(({ color: _color, ...run }) => { void _color; return run; }),
  };
  if (style.gradient) next.fillStyle = { type: "gradient", kind: "linear", angle: style.gradient.angle, rotateWithShape: true, stops: style.gradient.stops.map(([color, position]) => ({ color, position })) };
  if (style.fillTransparency) next.fillTransparency = style.fillTransparency;
  const { shadow: _shadow, ...otherEffects } = effects ?? {};
  void _shadow;
  const shadow = style.shadow && { type: "outer" as const, color: style.shadow.color, transparency: style.shadow.transparency, size: 100, blur: style.shadow.blur, angle: style.shadow.angle, distance: style.shadow.distance };
  const merged = { ...otherEffects, ...(shadow ? { shadow } : {}) };
  if (Object.keys(merged).length) next.effects = merged;
  return next;
}

const shadow = (color: string, blur: number, distance: number, angle = 45, transparency = 0.6) => ({ type: "outer" as const, color, transparency, size: 100, blur, angle, distance });
const hard = (color: string) => shadow(color, 0, 3, 45, 0);
const pattern = (name: keyof typeof POWERPOINT_PATTERNS, foreground: string) => ({ type: "pattern" as const, pattern: name, foreground, background: "#FFFFFF" });
const gradient = (stops: [string, number][], angle = 90) => ({ type: "gradient" as const, kind: "linear" as const, angle, stops: stops.map(([color, position]) => ({ color, position })) });
const solid = (color: string) => ({ type: "solid" as const, color });

/** The 20 WordArt styles, gallery order (PowerPoint's WordArtformat 30 + index). */
export const WORDART_STYLES: PresentationTextStyle[] = [
  { fill: solid("#000000"), effects: { shadow: shadow("#000000", 3, 1.5) } },
  { fill: solid("#156082"), effects: { shadow: shadow("#6E747A", 3, 2, 90) } },
  { fill: solid("#F6C6AD"), outline: { color: "#E97132", width: 1.75 } },
  { fill: solid("#FFFFFF"), outline: { color: "#A02B93", width: 0.8 }, effects: { shadow: shadow("#000000", 3, 1.8, 90) } },
  { fill: solid("#0F9ED5"), effects: { bevel: { preset: "circle", width: 6, height: 6 } } },
  { fill: gradient([["#53575C", 0.21], ["#C5C7CA", 0.88]]) },
  { fill: gradient([["#50164A", 0], ["#A02B93", 0.5], ["#D86ECC", 1]]), effects: { reflection: { transparency: 0.5, size: 50, blur: 0.5, distance: 0 } } },
  { fill: gradient([["#0F9ED5", 0], ["#61CBF4", 0.04], ["#CAEEFB", 0.87]]), outline: { color: "#0F9ED5", width: 1 } },
  { fill: solid("#FEFEFE"), outline: { color: "#156082", width: 0.75 }, effects: { glow: { color: "#156082", size: 3, transparency: 0.4 } } },
  { fill: solid("#196B24"), effects: { bevel: { preset: "angle", width: 6, height: 6 } } },
  { fill: solid("#000000"), outline: { color: "#FFFFFF", width: 0.75 }, effects: { shadow: { ...hard("#7F7F7F"), blur: 1 } } },
  { fill: solid("#262626"), outline: { color: "#FFFFFF", width: 1.06 }, effects: { shadow: hard("#A02B93") } },
  { fill: solid("#A02B93"), outline: { color: "#FFFFFF", width: 0.75 }, effects: { shadow: { ...hard("#D86ECC"), blur: 1 } } },
  { fill: solid("#FFFFFF"), outline: { color: "#E97132", width: 0.52 }, effects: { shadow: hard("#E97132") } },
  { fill: solid("#E8E8E8"), effects: { shadow: { type: "inner", color: "#000000", transparency: 0.5, size: 100, blur: 5, angle: 225, distance: 4 } } },
  { fill: pattern("dkUpDiag", "#7F7F7F"), effects: { shadow: shadow("#000000", 3, 1.5) } },
  { fill: pattern("narHorz", "#196B24"), outline: { color: "#0D3512", width: 1 }, effects: { shadow: { type: "inner", color: "#0D3512", transparency: 0.5, size: 100, blur: 14, angle: 90, distance: 0 } } },
  { fill: pattern("pct50", "#156082"), outline: { color: "#156082", width: 1 }, effects: { shadow: hard("#156082") } },
  { fill: pattern("ltDnDiag", "#D86ECC"), outline: { color: "#A02B93", width: 1 } },
  { fill: pattern("dkUpDiag", "#0E2841"), outline: { color: "#0B1E31", width: 1 }, effects: { shadow: hard("#0B1E31") } },
];
