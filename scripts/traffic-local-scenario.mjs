// Bounded authenticated loopback traffic, with no redirect to external services.
import fs from "node:fs";
import path from "node:path";
const root = path.resolve("data/local-scenario");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
if (process.env.NODE_ENV === "production" || manifest.kind !== "alpenblick-local-scenario" || path.resolve(manifest.database) !== path.join(root, "scenario.db")) throw new Error("Local demo only");
const base = "http://localhost:3000";
const results = [];
const routes = ["/", "/calendar", "/projects", "/projects/project-0", "/wiki", "/wiki/demo-2", "/wiki/presentations", "/documents", "/accounting", "/accounting/invoices", "/accounting/planning", "/accounting/funding-projects", "/personnel", "/municipalities", "/settings"];
async function sessionFor(user) {
  const response = await fetch(`${base}/api/auth/sign-in/username`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ username: user.username, password: manifest.password }), redirect: "error", signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${user.username}: login returned ${response.status}`);
  const data = await response.json();
  if (data.user?.email !== `${user.username}@alpenblick.example.invalid` || data.user?.id !== `demo-${user.username}`) throw new Error("Unexpected identity: stopping traffic");
  const cookie = response.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
  if (!cookie) throw new Error("No session cookie");
  return cookie;
}
// Verify all identities before visiting any application pages.
const sessions = [];
for (const user of manifest.users) {
  // Respect the application's login limiter; five people do not all sign in at once.
  if (sessions.length) await new Promise(resolve => setTimeout(resolve, 11000));
  sessions.push({ user, cookie: await sessionFor(user) });
}
await Promise.all(sessions.map(async ({ user, cookie }, index) => {
  for (let round = 0; round < 2; round++) for (let n = 0; n < routes.length; n++) {
    const route = routes[(n + index * 2) % routes.length];
    const start = performance.now();
    try {
      const response = await fetch(`${base}${route}`, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(90000) });
      const body = await response.text();
      const ok = response.status === 200 && !body.includes('"digest":"NEXT_REDIRECT;replace;/login') && !body.includes('id="__next_error__"');
      results.push({ user: user.username, route, round, status: response.status, ok, durationMs: Math.round(performance.now() - start), bytes: Buffer.byteLength(body) });
    } catch (error) { results.push({ user: user.username, route, round, ok: false, error: String(error) }); }
    await new Promise(resolve => setTimeout(resolve, 350 + index * 70));
  }
}));
const failures = results.filter(r => !r.ok);
fs.writeFileSync(path.join(root, "traffic-report.json"), JSON.stringify({ createdAt: new Date().toISOString(), requests: results.length, failures: failures.length, results }, null, 2));
console.log(JSON.stringify({ requests: results.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
