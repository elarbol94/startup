/**
 * Element Web is served by the `element` Compose service on this path of the
 * app's own origin (see deploy/nginx.conf and docs/chat.md). Same origin lets
 * the page frame it despite Element's `frame-ancestors 'self'` policy.
 */
export const ELEMENT_WEB_PATH = "/element/";
