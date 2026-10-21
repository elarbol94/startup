/**
 * Evaluates DrawingML preset shapes (ECMA-376 Part 1, §20.1.9 and §20.1.10) the way
 * PowerPoint does: guide formulas, paths, adjustment handles, connection sites and the
 * text rectangle, for a shape of a given size. Angles are in 60 000ths of a degree and
 * adjustment values in the spec's own units (most in 100 000ths), as stored in `avLst`.
 */
import definitions from "./preset-shape-definitions.json";

type Formula = string;
type Command = string[];
type Path = { commands: Command[]; w?: number; h?: number; fill?: string; stroke?: false };
type Handle = { kind: "xy" | "polar"; x: string; y: string; gdRefX?: string; minX?: string; maxX?: string; gdRefY?: string; minY?: string; maxY?: string; gdRefR?: string; minR?: string; maxR?: string; gdRefAng?: string; minAng?: string; maxAng?: string };
type Definition = { av: [string, Formula][]; gd: [string, Formula][]; ah: Handle[]; cxn: [string, string, string][]; rect?: [string, string, string, string]; paths: Path[] };
export type Point = { x: number; y: number };

const presets = definitions as unknown as Record<string, Definition>;
export const presetShapeNames = Object.keys(presets);
export const isPresetShape = (name: string | undefined): name is string => Boolean(name && presets[name]);

const DEG = 60000;
const toRadians = (angle: number) => (angle / DEG) * Math.PI / 180;
const fromRadians = (radians: number) => (radians * 180 / Math.PI) * DEG;

/** The spec's built-in guides for a w × h shape. */
function builtins(w: number, h: number): Record<string, number> {
  const ss = Math.min(w, h), ls = Math.max(w, h);
  const vars: Record<string, number> = {
    l: 0, t: 0, r: w, b: h, w, h, hc: w / 2, vc: h / 2, ss, ls,
    cd2: 10800000, cd4: 5400000, cd8: 2700000, "3cd4": 16200000, "3cd8": 8100000, "5cd8": 13500000, "7cd8": 18900000,
  };
  for (const n of [2, 3, 4, 5, 6, 8, 10, 12, 16, 32]) { vars[`wd${n}`] = w / n; vars[`hd${n}`] = h / n; vars[`ssd${n}`] = ss / n; }
  return vars;
}

function evaluate(formula: Formula, vars: Record<string, number>): number {
  // Some formulas in the spec's file separate their arguments with more than one space.
  const [op, ...raw] = formula.trim().split(/\s+/);
  const [x = 0, y = 0, z = 0] = raw.map((arg) => (arg in vars ? vars[arg] : Number(arg)));
  switch (op) {
    case "val": return x;
    case "*/": return z === 0 ? 0 : (x * y) / z;
    case "+-": return x + y - z;
    case "+/": return z === 0 ? 0 : (x + y) / z;
    case "?:": return x > 0 ? y : z;
    case "abs": return Math.abs(x);
    case "at2": return fromRadians(Math.atan2(y, x));
    case "cat2": return x * Math.cos(Math.atan2(z, y));
    case "sat2": return x * Math.sin(Math.atan2(z, y));
    case "cos": return x * Math.cos(toRadians(y));
    case "sin": return x * Math.sin(toRadians(y));
    case "tan": return x * Math.tan(toRadians(y));
    case "max": return Math.max(x, y);
    case "min": return Math.min(x, y);
    case "mod": return Math.sqrt(x * x + y * y + z * z);
    case "pin": return y < x ? x : y > z ? z : y;
    case "sqrt": return Math.sqrt(Math.max(0, x));
    default: return 0;
  }
}

/** Every guide of `name` at w × h, with `adjustments` overriding the preset's defaults. */
export function presetGuides(name: string, w: number, h: number, adjustments: Record<string, number> = {}): Record<string, number> {
  const definition = presets[name];
  const vars = builtins(w, h);
  if (!definition) return vars;
  for (const [key, formula] of definition.av) vars[key] = key in adjustments ? adjustments[key] : evaluate(formula, vars);
  for (const [key, formula] of definition.gd) vars[key] = evaluate(formula, vars);
  return vars;
}

/** The preset's default adjustment values (its `avLst`). */
export function presetDefaultAdjustments(name: string): Record<string, number> {
  const definition = presets[name];
  return definition ? Object.fromEntries(definition.av.map(([key, formula]) => [key, evaluate(formula, {})])) : {};
}

export type PresetPathResult = { d: string; fill: "none" | "norm" | "lighten" | "lightenLess" | "darken" | "darkenLess"; stroke: boolean };

const round = (value: number) => Math.round(value * 1000) / 1000;

/** SVG paths of the preset, in the shape's own w × h box. */
export function presetPaths(name: string, w: number, h: number, adjustments: Record<string, number> = {}): PresetPathResult[] {
  const definition = presets[name];
  if (!definition) return [];
  const vars = presetGuides(name, w, h, adjustments);
  return definition.paths.map((path) => {
    // A path with its own w/h draws in that coordinate space, scaled to the shape.
    const sx = path.w ? w / path.w : 1, sy = path.h ? h / path.h : 1;
    const value = (arg: string) => (arg in vars ? vars[arg] : Number(arg));
    const X = (arg: string) => value(arg) * sx, Y = (arg: string) => value(arg) * sy;
    let current: Point = { x: 0, y: 0 }, start: Point = { x: 0, y: 0 };
    const parts: string[] = [];
    for (const [command, ...args] of path.commands) {
      if (command === "M") { current = start = { x: X(args[0]), y: Y(args[1]) }; parts.push(`M${round(current.x)} ${round(current.y)}`); }
      else if (command === "L") { current = { x: X(args[0]), y: Y(args[1]) }; parts.push(`L${round(current.x)} ${round(current.y)}`); }
      else if (command === "Q") { current = { x: X(args[2]), y: Y(args[3]) }; parts.push(`Q${round(X(args[0]))} ${round(Y(args[1]))} ${round(current.x)} ${round(current.y)}`); }
      else if (command === "C") { current = { x: X(args[4]), y: Y(args[5]) }; parts.push(`C${round(X(args[0]))} ${round(Y(args[1]))} ${round(X(args[2]))} ${round(Y(args[3]))} ${round(current.x)} ${round(current.y)}`); }
      else if (command === "A") {
        const { svg, end } = arcTo(current, X(args[0]), Y(args[1]), value(args[2]), value(args[3]));
        parts.push(svg); current = end;
      } else if (command === "Z") { parts.push("Z"); current = start; }
    }
    const fill = (path.fill ?? "norm") as PresetPathResult["fill"];
    return { d: parts.join(" "), fill, stroke: path.stroke !== false };
  });
}

/**
 * DrawingML's arcTo: from the current point, along the ellipse wR × hR, starting at the
 * visual angle stAng and sweeping swAng. The angles are visual, so they are converted to the
 * ellipse's parametric angle before placing its centre.
 */
function arcTo(from: Point, wR: number, hR: number, stAng: number, swAng: number): { svg: string; end: Point } {
  if (wR === 0 || hR === 0) return { svg: "", end: from };
  const parametric = (angle: number) => { const a = toRadians(angle); return Math.atan2(wR * Math.sin(a), hR * Math.cos(a)); };
  const t0 = parametric(stAng);
  const centre = { x: from.x - wR * Math.cos(t0), y: from.y - hR * Math.sin(t0) };
  const pointAt = (angle: number) => { const t = parametric(angle); return { x: centre.x + wR * Math.cos(t), y: centre.y + hR * Math.sin(t) }; };
  const sweep = swAng > 0 ? 1 : 0;
  // A full turn is two half arcs: SVG cannot draw an arc back onto its own start point.
  if (Math.abs(swAng) >= 21600000) {
    const half = pointAt(stAng + swAng / 2), end = pointAt(stAng + swAng);
    return { svg: `A${round(wR)} ${round(hR)} 0 0 ${sweep} ${round(half.x)} ${round(half.y)} A${round(wR)} ${round(hR)} 0 0 ${sweep} ${round(end.x)} ${round(end.y)}`, end };
  }
  const end = pointAt(stAng + swAng);
  return { svg: `A${round(wR)} ${round(hR)} 0 ${Math.abs(swAng) > 10800000 ? 1 : 0} ${sweep} ${round(end.x)} ${round(end.y)}`, end };
}

/** Text area of the preset in its own box (the whole box when the preset has none). */
export function presetTextRect(name: string, w: number, h: number, adjustments: Record<string, number> = {}) {
  const rect = presets[name]?.rect;
  if (!rect) return { x: 0, y: 0, width: w, height: h };
  const vars = presetGuides(name, w, h, adjustments);
  const value = (arg: string) => (arg in vars ? vars[arg] : Number(arg));
  const [l, t, r, b] = rect.map(value);
  return { x: l, y: t, width: Math.max(0, r - l), height: Math.max(0, b - t) };
}

/** Connection sites of the preset in its own box, with the direction a line leaves them (degrees). */
export function presetConnectionSites(name: string, w: number, h: number, adjustments: Record<string, number> = {}): (Point & { angle: number })[] {
  const definition = presets[name];
  if (!definition) return [];
  const vars = presetGuides(name, w, h, adjustments);
  const value = (arg: string) => (arg in vars ? vars[arg] : Number(arg));
  return definition.cxn.map(([angle, x, y]) => ({ x: value(x), y: value(y), angle: value(angle) / DEG }));
}

export type PresetHandle = Point & { refs: string[]; kind: "xy" | "polar" };

/** The yellow adjustment handles of the preset in its own box. */
export function presetHandles(name: string, w: number, h: number, adjustments: Record<string, number> = {}): PresetHandle[] {
  const definition = presets[name];
  if (!definition) return [];
  const vars = presetGuides(name, w, h, adjustments);
  const value = (arg: string) => (arg in vars ? vars[arg] : Number(arg));
  return definition.ah.map((handle) => ({
    kind: handle.kind, x: value(handle.x), y: value(handle.y),
    refs: [handle.gdRefX, handle.gdRefY, handle.gdRefR, handle.gdRefAng].filter((ref): ref is string => Boolean(ref)),
  }));
}

/**
 * The adjustment values that put handle `index` as close as possible to `target` (local
 * box coordinates). Each referenced value is searched within the handle's own min/max,
 * so every preset's handle behaves as in PowerPoint without per-shape inverse formulas.
 */
export function solvePresetHandle(name: string, w: number, h: number, adjustments: Record<string, number>, index: number, target: Point): Record<string, number> {
  const handle = presets[name]?.ah[index];
  if (!handle) return adjustments;
  const current = { ...presetDefaultAdjustments(name), ...adjustments };
  const ranges: [string | undefined, string | undefined, string | undefined][] = handle.kind === "xy"
    ? [[handle.gdRefX, handle.minX, handle.maxX], [handle.gdRefY, handle.minY, handle.maxY]]
    : [[handle.gdRefAng, handle.minAng, handle.maxAng], [handle.gdRefR, handle.minR, handle.maxR]];
  let next = current;
  for (let pass = 0; pass < 2; pass++) {
    for (const [ref, minArg, maxArg] of ranges) {
      if (!ref) continue;
      const vars = presetGuides(name, w, h, next);
      const bound = (arg: string | undefined, fallback: number) => (arg === undefined ? fallback : arg in vars ? vars[arg] : Number(arg));
      // Unbounded handles (±2147483647) are searched within a generous multiple of the box.
      let low = bound(minArg, -100000), high = bound(maxArg, 100000);
      if (low < -1e7) low = -1e7; if (high > 1e7) high = 1e7;
      if (low > high) [low, high] = [high, low];
      const distance = (candidate: number) => {
        const h2 = presetHandles(name, w, h, { ...next, [ref]: candidate })[index];
        return Math.hypot(h2.x - target.x, h2.y - target.y);
      };
      // Coarse scan, then golden-section refinement around the best sample.
      let best = low, bestDistance = Infinity;
      for (let i = 0; i <= 48; i++) { const candidate = low + ((high - low) * i) / 48; const d = distance(candidate); if (d < bestDistance) { best = candidate; bestDistance = d; } }
      let a = Math.max(low, best - (high - low) / 48), b = Math.min(high, best + (high - low) / 48);
      for (let i = 0; i < 40; i++) {
        const c = b - (b - a) / 1.618, d = a + (b - a) / 1.618;
        if (distance(c) < distance(d)) b = d; else a = c;
      }
      next = { ...next, [ref]: Math.round((a + b) / 2) };
    }
  }
  return next;
}
