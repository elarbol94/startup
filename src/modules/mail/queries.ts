import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { MailError } from "./connection";
import { mailAccounts, type MailAccountRow } from "./schema";
import type { MailAccountSummary } from "./types";

export function toAccountSummary(row: MailAccountRow): MailAccountSummary {
  return {
    id: row.id,
    emailAddress: row.emailAddress,
    displayName: row.displayName,
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    imapSecure: row.imapSecure,
    smtpHost: row.smtpHost,
    smtpPort: row.smtpPort,
    smtpSecurity: row.smtpSecurity,
    username: row.username,
    signature: row.signature,
  };
}

/** The viewer's own mail accounts; mailboxes are never shared. */
export function listMailAccounts(userId: string): MailAccountSummary[] {
  return db
    .select()
    .from(mailAccounts)
    .where(eq(mailAccounts.userId, userId))
    .orderBy(asc(mailAccounts.sortOrder), asc(mailAccounts.createdAt))
    .all()
    .map(toAccountSummary);
}

/** The account if it belongs to the user; "not found" otherwise, so ids of others' accounts reveal nothing. */
export function getOwnedMailAccount(userId: string, accountId: string): MailAccountRow {
  const row = db
    .select()
    .from(mailAccounts)
    .where(and(eq(mailAccounts.id, accountId), eq(mailAccounts.userId, userId)))
    .get();
  if (!row) throw new MailError("not_found");
  return row;
}
