import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const nextCli = require.resolve("next/dist/bin/next");
const nativeCli = path.join(
  path.dirname(require.resolve("@typescript/native-preview/package.json")),
  "bin/tsgo.js",
);
const env = { ...process.env };
// Only this invocation's successful check can enable the faster build path.
delete env.MANAGEMENT_NATIVE_TYPECHECK_PASSED;

function run(cli, args, childEnv = env) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    stdio: "inherit",
    env: childEnv,
  });
  if (result.error) console.error(result.error.message);
  if (result.error || result.signal || result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run(nextCli, ["typegen"]);
console.log("Checking types with the native TypeScript compiler...");
run(nativeCli, [
  "--project", "tsconfig.build.json",
  "--noEmit",
  "--incremental",
  "--tsBuildInfoFile", ".next/cache/native.tsbuildinfo",
]);
run(nextCli, ["build"], {
  ...env,
  MANAGEMENT_NATIVE_TYPECHECK_PASSED: "1",
});
