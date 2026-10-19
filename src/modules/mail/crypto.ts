import crypto from "node:crypto";

/**
 * Mailbox passwords must be readable again to log in to IMAP/SMTP, so they are
 * encrypted (AES-256-GCM) rather than hashed. The key is derived from
 * BETTER_AUTH_SECRET, so a copied database alone does not reveal them.
 * Rotating BETTER_AUTH_SECRET makes stored passwords unreadable; users then
 * re-enter them in the account dialog.
 */
const VERSION = "v1";

function key() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("missing BETTER_AUTH_SECRET");
  return Buffer.from(crypto.hkdfSync("sha256", secret, "mail-account-password", "mail", 32));
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function decryptSecret(stored: string): string {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== VERSION || !iv || !tag || data === undefined) throw new Error("Unreadable mail password");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}
