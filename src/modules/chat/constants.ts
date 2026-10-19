/**
 * Element Web is served by the `element` Compose service under /element/ of
 * the app's own origin (see deploy/nginx.conf and docs/chat.md). Same origin
 * lets the page frame it despite Element's `frame-ancestors 'self'` policy.
 *
 * The frame loads index.html explicitly: during the first deploy the app
 * answered `/element/` with a permanent redirect to `/element`, which browsers
 * cache, so the bare directory URL could loop for them.
 */
export const ELEMENT_WEB_URL = "/element/index.html";
