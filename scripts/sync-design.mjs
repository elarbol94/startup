// Copies the frontend presentation layer into design/ so it can be opened in
// Claude Design (or any design tool) without the backend code around it.
// The copy mirrors the repo layout, so imports still read like the real code.
// Edit files in src/ (or port design changes back there); re-run to refresh.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "design", "source");

// Presentation-only sources. Server logic (schema/queries/actions) is not copied.
const include = [
  "src/app/globals.css",
  "src/app/layout.tsx",
  "src/app/loading.tsx",
  "src/app/(app)",
  "src/app/(auth)",
  "src/app/print",
  "src/app/share",
  "src/components",
  "src/modules/registry.ts",
  "src/lib/utils.ts",
  "messages",
  "components.json",
  "postcss.config.mjs",
];
const skip = /\.(test|spec)\.tsx?$/;

function copy(rel) {
  const from = path.join(root, rel);
  if (!existsSync(from)) return;
  if (statSync(from).isDirectory()) {
    for (const name of readdirSync(from)) copy(path.join(rel, name));
    return;
  }
  if (skip.test(rel)) return;
  const to = path.join(out, rel);
  mkdirSync(path.dirname(to), { recursive: true });
  cpSync(from, to);
}

rmSync(out, { recursive: true, force: true });
for (const rel of include) copy(rel);

// Module UI: only the components/ folders.
const modules = path.join(root, "src/modules");
for (const name of readdirSync(modules)) {
  const dir = path.join("src/modules", name, "components");
  if (existsSync(path.join(root, dir))) copy(dir);
}

console.log(`Design sources written to ${path.relative(root, out)}/`);
