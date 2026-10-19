import "server-only";

import type { ImapFlow } from "imapflow";
import { credentialsFor, MailError, type MailCredentials } from "./connection";
import { withImap } from "./imap";
import { getOwnedMailAccount } from "./queries";
import type { MailAccountRow } from "./schema";
import type { MailResult } from "./types";

/**
 * Opens the user's account and runs `task` on its IMAP connection, turning
 * mail errors into a result the UI can show (wrong password, server down, …).
 */
export async function runOnMailbox<T>(
  userId: string,
  accountId: string,
  task: (client: ImapFlow, account: MailAccountRow, credentials: MailCredentials) => Promise<T>,
): Promise<MailResult<T>> {
  try {
    const account = getOwnedMailAccount(userId, accountId);
    const credentials = credentialsFor(account);
    const value = await withImap(account.id, credentials, (client) => task(client, account, credentials));
    return { ok: true, value };
  } catch (error) {
    if (error instanceof MailError) return { ok: false, error: error.code, detail: error.message };
    console.error("[mail] unexpected error", error);
    return { ok: false, error: "unknown" };
  }
}
