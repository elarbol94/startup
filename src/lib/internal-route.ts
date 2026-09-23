/**
 * Accepts only same-origin paths. Browsers treat "/\evil.com" like
 * "//evil.com", and tabs/newlines are stripped from URLs, so the check resolves
 * the route instead of inspecting its prefix.
 */
export function safeInternalRoute(route: string) {
  const base = "http://internal.invalid";
  if (!route.startsWith("/") || /[\\\u0000-\u001f]/.test(route) || new URL(route, base).origin !== base) {
    throw new Error("Links must use an internal route");
  }
  return route;
}
