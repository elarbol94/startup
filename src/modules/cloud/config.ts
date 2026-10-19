import "server-only";

const DEFAULT_NEXTCLOUD_URL = "https://cloud.banond.com";

/**
 * The Nextcloud instance shown in the Cloud tab (see .env.example). Only https: URLs are
 * embedded; anything else falls back to the default so a typo cannot frame an arbitrary page.
 */
export function nextcloudUrl(): string {
  const configured = process.env.NEXTCLOUD_URL?.trim();
  if (!configured) return DEFAULT_NEXTCLOUD_URL;
  try {
    const url = new URL(configured);
    return url.protocol === "https:" ? url.toString().replace(/\/$/, "") : DEFAULT_NEXTCLOUD_URL;
  } catch {
    return DEFAULT_NEXTCLOUD_URL;
  }
}
