import "server-only";

import dns from "node:dns/promises";
import net from "node:net";
import { privateAddress } from "@/lib/public-fetch";
import { decryptSecret } from "./crypto";
import type { MailAccountRow } from "./schema";
import type { MailErrorCode } from "./types";

/** Error with a code the UI can translate. */
export class MailError extends Error {
  constructor(readonly code: MailErrorCode, detail?: string) {
    super(detail ?? code);
  }
}

export type MailCredentials = {
  emailAddress: string;
  displayName: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: "tls" | "starttls";
  username: string;
  password: string;
};

export function credentialsFor(account: MailAccountRow): MailCredentials {
  let password: string;
  try {
    password = decryptSecret(account.passwordEncrypted);
  } catch {
    throw new MailError("auth_failed", "Stored password cannot be decrypted; enter it again.");
  }
  return { ...account, password };
}

/**
 * Mail hosts are typed in by users, so the server would otherwise connect to
 * anything it can reach, including the Compose services next to it. Private
 * addresses are refused unless MAIL_ALLOW_PRIVATE_HOSTS=true (for a mail
 * server in the same LAN).
 */
export async function assertReachableMailHost(host: string): Promise<void> {
  if (process.env.MAIL_ALLOW_PRIVATE_HOSTS === "true") return;
  let addresses: string[];
  try {
    addresses = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((entry) => entry.address);
  } catch {
    throw new MailError("connection_failed", `Host ${host} not found`);
  }
  if (addresses.length === 0 || addresses.some(privateAddress)) {
    throw new MailError("connection_failed", `Host ${host} is in a private network`);
  }
}

const tlsCodes = /CERT|SELF_SIGNED|TLS|SSL|EPROTO|wrong version number/i;

/** Maps errors from imapflow/nodemailer to a translatable code. */
export function toMailError(error: unknown): MailError {
  if (error instanceof MailError) return error;
  const value = error as { authenticationFailed?: boolean; code?: string; responseCode?: number; message?: string; responseText?: string } | undefined;
  const text = `${value?.code ?? ""} ${value?.message ?? ""} ${value?.responseText ?? ""}`;
  if (value?.authenticationFailed || value?.code === "EAUTH" || /AUTHENTICATIONFAILED|Invalid credentials|authentication failed|535/i.test(text)) {
    return new MailError("auth_failed", value?.responseText || value?.message);
  }
  if (tlsCodes.test(text)) return new MailError("tls_failed", value?.message);
  if (value?.code === "EENVELOPE" || (Boolean(value?.responseCode) && /recipient|550|553|554/i.test(text))) {
    return new MailError("recipient_rejected", value?.message);
  }
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ECONNRESET|ESOCKET|ECONNECTION|NoConnection|timed? ?out|closed/i.test(text)) {
    return new MailError("connection_failed", value?.message);
  }
  return new MailError("unknown", value?.message);
}
