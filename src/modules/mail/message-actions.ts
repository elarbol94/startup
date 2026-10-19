"use server";

// Mailbox actions behind the Mail section: folders, message lists, reading,
// flags, moving and deleting. Every call reads the live mailbox over IMAP.
// Used by components/mail-client/use-mailbox.ts. Sending is a route handler
// (app/api/mail/send) because messages with attachments exceed the server
// action body limit.
import { z } from "zod";
import { requireUserOrThrow } from "@/lib/auth";
import { deleteMessages, listFolders, listMessages, moveMessages, readMessage, setFlags } from "./imap";
import { runOnMailbox } from "./mailbox";
import type { MailFolder, MailListPage, MailMessage, MailResult } from "./types";

const accountId = z.string().min(1).max(64);
const folder = z.string().min(1).max(1_000);
const uid = z.number().int().positive();
const uids = z.array(uid).min(1).max(500);

export async function loadMailFolders(input: { accountId: string }): Promise<MailResult<MailFolder[]>> {
  const currentUser = await requireUserOrThrow();
  const data = z.object({ accountId }).parse(input);
  return runOnMailbox(currentUser.id, data.accountId, (client) => listFolders(client));
}

export async function loadMailMessages(input: {
  accountId: string;
  folder: string;
  page: number;
  query?: string;
  unreadOnly?: boolean;
}): Promise<MailResult<MailListPage>> {
  const currentUser = await requireUserOrThrow();
  const data = z.object({
    accountId,
    folder,
    page: z.number().int().min(0).max(10_000),
    query: z.string().trim().max(200).optional(),
    unreadOnly: z.boolean().optional(),
  }).parse(input);
  return runOnMailbox(currentUser.id, data.accountId, (client) =>
    listMessages(client, data.folder, { page: data.page, pageSize: 50, query: data.query, unreadOnly: data.unreadOnly }));
}

export async function loadMailMessage(input: { accountId: string; folder: string; uid: number }): Promise<MailResult<MailMessage>> {
  const currentUser = await requireUserOrThrow();
  const data = z.object({ accountId, folder, uid }).parse(input);
  return runOnMailbox(currentUser.id, data.accountId, (client) => readMessage(client, data.folder, data.uid));
}

export async function updateMailFlags(input: {
  accountId: string;
  folder: string;
  uids: number[];
  seen?: boolean;
  flagged?: boolean;
}): Promise<MailResult<null>> {
  const currentUser = await requireUserOrThrow();
  const data = z.object({ accountId, folder, uids, seen: z.boolean().optional(), flagged: z.boolean().optional() }).parse(input);
  return runOnMailbox(currentUser.id, data.accountId, async (client) => {
    await setFlags(client, data.folder, data.uids, { seen: data.seen, flagged: data.flagged });
    return null;
  });
}

export async function moveMail(input: { accountId: string; folder: string; uids: number[]; target: string }): Promise<MailResult<null>> {
  const currentUser = await requireUserOrThrow();
  const data = z.object({ accountId, folder, uids, target: folder }).parse(input);
  return runOnMailbox(currentUser.id, data.accountId, async (client) => {
    await moveMessages(client, data.folder, data.uids, data.target);
    return null;
  });
}

export async function deleteMail(input: { accountId: string; folder: string; uids: number[] }): Promise<MailResult<"trashed" | "deleted">> {
  const currentUser = await requireUserOrThrow();
  const data = z.object({ accountId, folder, uids }).parse(input);
  return runOnMailbox(currentUser.id, data.accountId, (client) => deleteMessages(client, data.folder, data.uids));
}
