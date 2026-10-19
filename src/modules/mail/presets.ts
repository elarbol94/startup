import type { SmtpSecurity } from "./schema";

export type MailServerPreset = {
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SmtpSecurity;
  /** Shown in the account dialog, e.g. that an app password is required. */
  note?: "appPassword" | "oauthOnly" | "hetzner";
};

/**
 * The company's own domains are hosted on Hetzner Webhosting (konsoleH), so
 * any address that is not a known public provider gets these servers. The
 * mailbox login is the full email address.
 */
export const HETZNER_WEBHOSTING: MailServerPreset = {
  imapHost: "mail.your-server.de", imapPort: 993, imapSecure: true,
  smtpHost: "mail.your-server.de", smtpPort: 587, smtpSecurity: "starttls",
  note: "hetzner",
};

const presets: Record<string, MailServerPreset> = {
  gmail: { imapHost: "imap.gmail.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.gmail.com", smtpPort: 465, smtpSecurity: "tls", note: "appPassword" },
  outlook: { imapHost: "outlook.office365.com", imapPort: 993, imapSecure: true, smtpHost: "smtp-mail.outlook.com", smtpPort: 587, smtpSecurity: "starttls", note: "oauthOnly" },
  icloud: { imapHost: "imap.mail.me.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.mail.me.com", smtpPort: 587, smtpSecurity: "starttls", note: "appPassword" },
  gmx: { imapHost: "imap.gmx.net", imapPort: 993, imapSecure: true, smtpHost: "mail.gmx.net", smtpPort: 465, smtpSecurity: "tls" },
  webde: { imapHost: "imap.web.de", imapPort: 993, imapSecure: true, smtpHost: "smtp.web.de", smtpPort: 587, smtpSecurity: "starttls" },
  ionos: { imapHost: "imap.ionos.de", imapPort: 993, imapSecure: true, smtpHost: "smtp.ionos.de", smtpPort: 465, smtpSecurity: "tls" },
  posteo: { imapHost: "posteo.de", imapPort: 993, imapSecure: true, smtpHost: "posteo.de", smtpPort: 465, smtpSecurity: "tls" },
  mailboxorg: { imapHost: "imap.mailbox.org", imapPort: 993, imapSecure: true, smtpHost: "smtp.mailbox.org", smtpPort: 465, smtpSecurity: "tls" },
  yahoo: { imapHost: "imap.mail.yahoo.com", imapPort: 993, imapSecure: true, smtpHost: "smtp.mail.yahoo.com", smtpPort: 465, smtpSecurity: "tls", note: "appPassword" },
  aon: { imapHost: "imap.a1.net", imapPort: 993, imapSecure: true, smtpHost: "smtp.a1.net", smtpPort: 465, smtpSecurity: "tls" },
};

const domains: Record<string, keyof typeof presets> = {
  "gmail.com": "gmail", "googlemail.com": "gmail",
  "outlook.com": "outlook", "outlook.de": "outlook", "outlook.at": "outlook", "hotmail.com": "outlook", "hotmail.de": "outlook", "live.com": "outlook", "live.de": "outlook", "live.at": "outlook", "msn.com": "outlook",
  "icloud.com": "icloud", "me.com": "icloud", "mac.com": "icloud",
  "gmx.de": "gmx", "gmx.at": "gmx", "gmx.net": "gmx", "gmx.ch": "gmx",
  "web.de": "webde",
  "ionos.de": "ionos",
  "posteo.de": "posteo", "posteo.net": "posteo",
  "mailbox.org": "mailboxorg",
  "yahoo.com": "yahoo", "yahoo.de": "yahoo",
  "aon.at": "aon", "a1.net": "aon",
};

/**
 * Server settings for well-known providers, looked up by the address' domain.
 * Every other domain gets Hetzner Webhosting, which the user can still edit.
 */
export function guessMailServer(emailAddress: string): MailServerPreset {
  const domain = emailAddress.split("@")[1]?.trim().toLowerCase() ?? "";
  return presets[domains[domain]] ?? HETZNER_WEBHOSTING;
}

/** Providers that file sent mail into "Sent" themselves; appending a copy would duplicate it. */
export function providerStoresSentMail(smtpHost: string): boolean {
  return /(^|\.)(gmail\.com|googlemail\.com|outlook\.com|office365\.com|outlook\.office365\.com)$/i.test(smtpHost.trim());
}
