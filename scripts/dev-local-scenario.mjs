import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

if (process.env.NODE_ENV === "production") throw new Error("The scenario is development-only");
const root = path.resolve("data/local-scenario");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
if (manifest.kind !== "alpenblick-local-scenario" || path.resolve(manifest.database) !== path.join(root, "scenario.db")) throw new Error("Invalid local scenario manifest");
if (!fs.existsSync(manifest.database)) throw new Error("Scenario database missing");
const env = {
  ...process.env,
  NODE_ENV: "development",
  DATABASE_PATH: path.join(root, "scenario.db"),
  UPLOADS_PATH: path.join(root, "uploads"),
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_TRUSTED_ORIGINS: "http://localhost:3000",
  LOCAL_AUTH_BYPASS: "false",
  WIKI_FIGURE_ROOTS: "{}",
  SMTP_HOST: "",
  SMTP_USER: "",
  SMTP_PASSWORD: "",
  SMTP_FROM: "",
  LANGUAGETOOL_URL: "",
};
console.log(`Local demo only: ${env.DATABASE_PATH}`);
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3000"], { env, stdio: "inherit", windowsHide: true });
child.on("exit", code => { process.exitCode = code ?? 1; });
child.on("error", error => { console.error(error); process.exitCode = 1; });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
