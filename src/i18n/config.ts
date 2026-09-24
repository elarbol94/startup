export const locales = ["de", "en"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "de";
export const LOCALE_COOKIE = "locale";

// Business time zone for all next-intl date formatting. Without it, the server
// (UTC) and browsers (Europe/Vienna) disagree on local-midnight dates, which
// shifts date-only values by a day and causes hydration mismatches.
export const timeZone = "Europe/Vienna";
