import crypto from "node:crypto";
import { z } from "zod";

/**
 * HS256 JWTs for the ONLYOFFICE integration.
 * - Editor configs and requests we send are signed with the inbox secret
 *   (the document server verifies browser configs with it, too).
 * - Callbacks arrive as `Authorization: Bearer <jwt>` with a `payload` claim,
 *   signed with the outbox secret; only the verified payload is trusted.
 * - File URLs the document server fetches carry an app-only token bound to one
 *   stored resource.
 */
const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");
const HEADER = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));

export function signJwt(payload: object, secret: string) {
  const body = b64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", secret).update(`${HEADER}.${body}`).digest("base64url");
  return `${HEADER}.${body}.${signature}`;
}

export class TokenError extends Error {}

export function verifyJwt(token: string, secret: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new TokenError("malformed");
  const [header, body, signature] = parts;
  let alg: unknown;
  try { alg = JSON.parse(Buffer.from(header, "base64url").toString("utf8")).alg; } catch { throw new TokenError("malformed"); }
  if (alg !== "HS256") throw new TokenError("algorithm");
  const expected = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest();
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) throw new TokenError("signature");
  let claims: unknown;
  try { claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { throw new TokenError("malformed"); }
  if (!claims || typeof claims !== "object" || Array.isArray(claims)) throw new TokenError("malformed");
  const exp = (claims as { exp?: unknown }).exp;
  if (typeof exp === "number" && exp * 1000 < Date.now()) throw new TokenError("expired");
  return claims as Record<string, unknown>;
}

/** App-only key for file tokens, derived so it never equals a shared secret. */
function fileKey() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new TokenError("missing BETTER_AUTH_SECRET");
  return Buffer.from(crypto.hkdfSync("sha256", secret, "office-file-token", "wiki-office", 32)).toString("hex");
}

const fileClaims = z.object({
  typ: z.literal("file"),
  res: z.enum(["docx", "changes"]),
  pageId: z.string().min(1),
  versionId: z.string().min(1),
  attachmentId: z.string().min(1),
  exp: z.number(),
});
export type FileClaims = z.infer<typeof fileClaims>;

export function signFileToken(claims: Omit<FileClaims, "typ" | "exp">, ttlSeconds = 3600) {
  return signJwt({ typ: "file", ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds }, fileKey());
}

export function verifyFileToken(token: string): FileClaims {
  return fileClaims.parse(verifyJwt(token, fileKey()));
}
