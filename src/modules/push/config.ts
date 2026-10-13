import "server-only";

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

/**
 * Web Push is off until VAPID keys are configured (see .env.example). The subject
 * must be an https: URL or mailto: address that push services can contact.
 */
export function vapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const subject = process.env.VAPID_SUBJECT?.trim() || process.env.BETTER_AUTH_URL?.trim() || "";
  return { publicKey, privateKey, subject: /^(https:|mailto:)/.test(subject) ? subject : "mailto:admin@example.invalid" };
}
