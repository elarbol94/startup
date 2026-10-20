// PowerPoint's Office theme colours and the colour picker grid built from them, as read from
// desktop PowerPoint (docs/plans/presentation-powerpoint-formatting.md). Colours are stored as
// hex in the canvas; the theme only supplies the choices.

export const THEME_COLORS = {
  bg1: "#FFFFFF", tx1: "#000000", bg2: "#E8E8E8", tx2: "#0E2841",
  accent1: "#156082", accent2: "#E97132", accent3: "#196B24", accent4: "#0F9ED5", accent5: "#A02B93", accent6: "#4EA72E",
} as const;
export type ThemeColorKey = keyof typeof THEME_COLORS;

/** Picker columns, left to right, with PowerPoint's colour names. */
export const THEME_COLUMNS: { key: ThemeColorKey; name: string; role: string }[] = [
  { key: "bg1", name: "White", role: "Background 1" }, { key: "tx1", name: "Black", role: "Text 1" },
  { key: "bg2", name: "Light Gray", role: "Background 2" }, { key: "tx2", name: "Dark Blue", role: "Text 2" },
  { key: "accent1", name: "Dark Teal", role: "Accent 1" }, { key: "accent2", name: "Orange", role: "Accent 2" },
  { key: "accent3", name: "Dark Green", role: "Accent 3" }, { key: "accent4", name: "Turquoise", role: "Accent 4" },
  { key: "accent5", name: "Plum", role: "Accent 5" }, { key: "accent6", name: "Green", role: "Accent 6" },
];

/** A tint or shade of a theme colour: "Lighter 80%" is +0.8, "Darker 25%" is −0.25. */
type Variant = number;
/** The five variant rows under each column. White, black and the two light/dark columns differ from the accents. */
const VARIANTS: Record<"bg1" | "tx1" | "bg2" | "tx2" | "accent", Variant[]> = {
  bg1: [-0.05, -0.15, -0.25, -0.35, -0.5],
  tx1: [0.5, 0.35, 0.25, 0.15, 0.05],
  bg2: [-0.1, -0.25, -0.5, -0.75, -0.9],
  tx2: [0.9, 0.75, 0.5, 0.25, 0.1],
  accent: [0.8, 0.6, 0.4, -0.25, -0.5],
};
export function themeVariants(key: ThemeColorKey): Variant[] {
  return key.startsWith("accent") ? VARIANTS.accent : VARIANTS[key as Exclude<ThemeColorKey, `accent${number}`>];
}

/** PowerPoint's standard colours row. */
export const STANDARD_COLORS: { name: string; color: string }[] = [
  { name: "Dark Red", color: "#C00000" }, { name: "Red", color: "#FF0000" }, { name: "Orange", color: "#FFC000" },
  { name: "Yellow", color: "#FFFF00" }, { name: "Light Green", color: "#92D050" }, { name: "Green", color: "#00B050" },
  { name: "Light Blue", color: "#00B0F0" }, { name: "Blue", color: "#0070C0" }, { name: "Dark Blue", color: "#002060" },
  { name: "Purple", color: "#7030A0" },
];

function toHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function fromHsl(h: number, s: number, l: number): string {
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  let r = l, g = l, b = l;
  if (s) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    r = hue(p, q, h + 1 / 3); g = hue(p, q, h); b = hue(p, q, h - 1 / 3);
  }
  return "#" + [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * DrawingML brightness: b > 0 lightens (`lumMod 1−b, lumOff b`), b < 0 darkens (`lumMod 1+b`),
 * both on HSL luminance. This is the arithmetic behind "Lighter 40%" and the gradient stops.
 */
export function withBrightness(hex: string, brightness: number): string {
  if (!/^#?[0-9a-f]{6}/i.test(hex) || !brightness) return hex;
  const [h, s, l] = toHsl(hex);
  return fromHsl(h, s, brightness > 0 ? l * (1 - brightness) + brightness : l * (1 + brightness));
}

export type PickerSwatch = { color: string; name: string };
/** The 6 × 10 theme grid: a row of base colours, then five rows of tints and shades. */
export function themeColorGrid(): PickerSwatch[][] {
  const rows: PickerSwatch[][] = [THEME_COLUMNS.map((c) => ({ color: THEME_COLORS[c.key], name: `${c.name}, ${c.role}` }))];
  for (let row = 0; row < 5; row++) {
    rows.push(THEME_COLUMNS.map((c) => {
      const v = themeVariants(c.key)[row];
      return { color: withBrightness(THEME_COLORS[c.key], v), name: `${c.name}, ${c.role}, ${v > 0 ? "Lighter" : "Darker"} ${Math.round(Math.abs(v) * 100)}%` };
    }));
  }
  return rows;
}

/** PowerPoint's default gradient for a fill colour: linear, 90°, four stops (read back via COM). */
export function defaultGradient(color: string) {
  const base = /^#[0-9a-f]{6}/i.test(color) ? color : THEME_COLORS.accent1;
  return {
    type: "gradient" as const, kind: "linear" as const, angle: 90, rotateWithShape: true,
    stops: [[0, 0.95], [0.74, 0.55], [0.83, 0.55], [1, 0.7]].map(([position, brightness]) => ({ color: withBrightness(base, brightness), position, transparency: 0 })),
  };
}
