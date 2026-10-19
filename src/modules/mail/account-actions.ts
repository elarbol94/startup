"use server";

// Mail account actions: connecting, editing and removing a mailbox.
// Used by components/mail-client/account-dialog.tsx.
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import { credentialsFor, MailError, type MailCredentials } from "./connection";
import { encryptSecret } from "./crypto";
import { closeImapConnection, verifyImapLogin } from "./imap";
import { isEmailAddress } from "./mail-utils";
import { getOwnedMailAccount, toAccountSummary } from "./queries";
import { mailAccounts, smtpSecurityModes } from "./schema";
import { verifySmtpLogin } from "./smtp";
import type { MailAccountSummary, MailResult } from "./types";

const hostname = z.string().trim().min(1).max(253).regex(/^[a-zA-Z0-9.-]+$|^\[?[0-9a-fA-F:.]+\]?$/);
const port = z.coerce.number().int().min(1).max(65_535);

const accountInput = z.object({
  emailAddress: z.string().trim().max(254).refine(isEmailAddress),
  displayName: z.string().trim().max(120),
  imapHost: hostname,
  imapPort: port,
  imapSecure: z.boolean(),
  smtpHost: hostname,
  smtpPort: port,
  smtpSecurity: z.enum(smtpSecurityModes),
  username: z.string().trim().min(1).max(254),
  signature: z.string().max(4_000),
});

export type MailAccountInput = z.input<typeof accountInput> & { password: string };

/** Logs in to IMAP and SMTP with the given settings; nothing is stored when either fails. */
async function verify(credentials: MailCredentials): Promise<MailResult<null>> {
  try {
    await verifyImapLogin(credentials);
  } catch (error) {
    const mailError = error instanceof MailError ? error : new MailError("unknown");
    return { ok: false, error: mailError.code, detail: `IMAP: ${mailError.message}` };
  }
  try {
    await verifySmtpLogin(credentials);
  } catch (error) {
    const mailError = error instanceof MailError ? error : new MailError("unknown");
    return { ok: false, error: mailError.code, detail: `SMTP: ${mailError.message}` };
  }
  return { ok: true, value: null };
}

export async function createMailAccount(input: MailAccountInput): Promise<MailResult<MailAccountSummary>> {
  const currentUser = await requireUserOrThrow();
  const data = accountInput.parse(input);
  const password = z.string().min(1).max(1_000).parse(input.password);
  const check = await verify({ ...data, password });
  if (!check.ok) return check;
  const count = db.select({ id: mailAccounts.id }).from(mailAccounts).where(eq(mailAccounts.userId, currentUser.id)).all().length;
  const row = db
    .insert(mailAccounts)
    .values({ ...data, userId: currentUser.id, passwordEncrypted: encryptSecret(password), sortOrder: count })
    .returning()
    .get();
  revalidatePath("/mail");
  return { ok: true, value: toAccountSummary(row) };
}

/** Updates settings; an empty password keeps the stored one. */
export async function updateMailAccount(accountId: string, input: MailAccountInput): Promise<MailResult<MailAccountSummary>> {
  const currentUser = await requireUserOrThrow();
  let existing;
  try {
    existing = getOwnedMailAccount(currentUser.id, z.string().min(1).parse(accountId));
  } catch {
    return { ok: false, error: "not_found" };
  }
  const data = accountInput.parse(input);
  const newPassword = z.string().max(1_000).parse(input.password ?? "");
  const serverChanged = (["imapHost", "imapPort", "imapSecure", "smtpHost", "smtpPort", "smtpSecurity", "username", "emailAddress"] as const)
    .some((field) => existing[field] !== data[field]);
  let passwordEncrypted = existing.passwordEncrypted;
  if (newPassword || serverChanged) {
    let password = newPassword;
    if (!password) {
      try {
        password = credentialsFor(existing).password;
      } catch {
        return { ok: false, error: "auth_failed" };
      }
    }
    const check = await verify({ ...data, password });
    if (!check.ok) return check;
    passwordEncrypted = encryptSecret(password);
  }
  const row = db
    .update(mailAccounts)
    .set({ ...data, passwordEncrypted, updatedAt: new Date() })
    .where(and(eq(mailAccounts.id, existing.id), eq(mailAccounts.userId, currentUser.id)))
    .returning()
    .get();
  closeImapConnection(existing.id);
  revalidatePath("/mail");
  return { ok: true, value: toAccountSummary(row) };
}

/** Removes the account from the platform; the mailbox itself is untouched. */
export async function deleteMailAccount(accountId: string): Promise<void> {
  const currentUser = await requireUserOrThrow();
  const id = z.string().min(1).parse(accountId);
  db.delete(mailAccounts).where(and(eq(mailAccounts.id, id), eq(mailAccounts.userId, currentUser.id))).run();
  closeImapConnection(id);
  revalidatePath("/mail");
}
