/**
 * ONLYOFFICE identifies mentioned users by e-mail. We hand it stable synthetic
 * addresses instead of real ones and map them back when it reports a mention.
 */
const DOMAIN = "@users.invalid";

export const mentionEmail = (userId: string) => `${userId}${DOMAIN}`;

export function mentionEmailUserId(email: string) {
  return email.endsWith(DOMAIN) ? email.slice(0, -DOMAIN.length) || null : null;
}
