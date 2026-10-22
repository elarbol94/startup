import "server-only";

import { ImapFlow, type FetchMessageObject, type ListResponse, type MessageAddressObject, type MessageStructureObject } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import { MailError, resolveMailHost, toMailError, type MailCredentials, type MailTarget } from "./connection";
import { hasRemoteContent, sanitizeMailHtml } from "./sanitize";
import type { MailAddress, MailAttachmentInfo, MailFolder, MailListItem, MailListPage, MailMessage, MailSpecialUse } from "./types";

/** Largest message the viewer downloads and parses in full. */
export const MAX_MESSAGE_BYTES = 40 * 1024 * 1024;
const IDLE_CLOSE_MS = 4 * 60 * 1000;

type PoolEntry = { fingerprint: string; ready: Promise<ImapFlow>; timer?: NodeJS.Timeout };

// One connection per account, reused across requests (logging in costs a TLS
// handshake plus a round trip) and closed after a few idle minutes. Kept on
// globalThis so dev-mode reloads do not leak connections.
const globalForImap = globalThis as unknown as { mailImapPool?: Map<string, PoolEntry> };
const pool = (globalForImap.mailImapPool ??= new Map());

function fingerprintOf(id: string, credentials: MailCredentials) {
  return [id, credentials.imapHost, credentials.imapPort, credentials.imapSecure, credentials.username, credentials.password].join("\u0000");
}

function createClient(credentials: MailCredentials, target: MailTarget) {
  return new ImapFlow({
    ...target,
    port: credentials.imapPort,
    secure: credentials.imapSecure,
    auth: { user: credentials.username, pass: credentials.password },
    logger: false,
    emitLogs: false,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 120_000,
    disableAutoIdle: true,
  });
}

function drop(accountId: string, entry: PoolEntry) {
  if (pool.get(accountId) !== entry) return;
  pool.delete(accountId);
  clearTimeout(entry.timer);
  entry.ready.then((client) => client.logout().catch(() => client.close()), () => undefined);
}

async function clientFor(accountId: string, credentials: MailCredentials): Promise<ImapFlow> {
  const fingerprint = fingerprintOf(accountId, credentials);
  const existing = pool.get(accountId);
  if (existing && existing.fingerprint !== fingerprint) drop(accountId, existing);
  let entry = pool.get(accountId);
  if (!entry) {
    const created: PoolEntry = {
      fingerprint,
      ready: (async () => {
        const client = createClient(credentials, await resolveMailHost(credentials.imapHost));
        client.on("error", () => drop(accountId, created));
        client.on("close", () => drop(accountId, created));
        await client.connect();
        return client;
      })(),
    };
    created.ready.catch(() => drop(accountId, created));
    pool.set(accountId, created);
    entry = created;
  }
  clearTimeout(entry.timer);
  const current = entry;
  current.timer = setTimeout(() => drop(accountId, current), IDLE_CLOSE_MS);
  current.timer.unref?.();
  const client = await current.ready;
  if (!client.usable) {
    drop(accountId, current);
    return clientFor(accountId, credentials);
  }
  return client;
}

/** Runs `task` with a logged-in IMAP connection for the account. */
export async function withImap<T>(accountId: string, credentials: MailCredentials, task: (client: ImapFlow) => Promise<T>): Promise<T> {
  try {
    const client = await clientFor(accountId, credentials);
    return await task(client);
  } catch (error) {
    const entry = pool.get(accountId);
    if (entry && !(error instanceof MailError && error.code === "not_found")) {
      // A failed command can leave the connection in an unknown state; start fresh next time.
      const client = await entry.ready.catch(() => null);
      if (!client?.usable) drop(accountId, entry);
    }
    throw toMailError(error);
  }
}

/** Logs in once without keeping the connection, to check new account settings. */
export async function verifyImapLogin(credentials: MailCredentials): Promise<void> {
  const client = createClient(credentials, await resolveMailHost(credentials.imapHost));
  client.on("error", () => undefined);
  try {
    await client.connect();
    await client.logout();
  } catch (error) {
    client.close();
    throw toMailError(error);
  }
}

export function closeImapConnection(accountId: string) {
  const entry = pool.get(accountId);
  if (entry) drop(accountId, entry);
}

const specialUseMap: Record<string, MailSpecialUse> = {
  "\\Inbox": "inbox",
  "\\Sent": "sent",
  "\\Drafts": "drafts",
  "\\Trash": "trash",
  "\\Junk": "junk",
  "\\Archive": "archive",
  "\\Flagged": "flagged",
  "\\All": "all",
};
const folderOrder: MailSpecialUse[] = ["inbox", "drafts", "sent", "archive", "flagged", "all", "junk", "trash"];

function specialUseOf(entry: Pick<ListResponse, "specialUse" | "path">): MailSpecialUse | null {
  if (entry.path.toUpperCase() === "INBOX") return "inbox";
  return entry.specialUse ? specialUseMap[entry.specialUse] ?? null : null;
}

export async function listFolders(client: ImapFlow): Promise<MailFolder[]> {
  const entries = await client.list({ statusQuery: { messages: true, unseen: true } });
  const folders = entries.map((entry): MailFolder => {
    const selectable = !entry.flags.has("\\Noselect") && !entry.flags.has("\\NonExistent");
    return {
      path: entry.path,
      name: entry.path.toUpperCase() === "INBOX" ? "INBOX" : entry.name,
      depth: entry.parent.length,
      specialUse: specialUseOf(entry),
      total: entry.status?.messages ?? 0,
      unseen: entry.status?.unseen ?? 0,
      selectable,
    };
  });
  // Special folders first in a fixed order; the rest keep their tree order by path.
  const rank = (folder: MailFolder) => (folder.specialUse && folder.depth === 0 ? folderOrder.indexOf(folder.specialUse) : folderOrder.length);
  return folders.sort((a, b) => rank(a) - rank(b) || a.path.localeCompare(b.path, undefined, { sensitivity: "base" }));
}

export async function findSpecialFolder(client: ImapFlow, use: MailSpecialUse): Promise<string | null> {
  const entries = await client.list();
  return entries.find((entry) => specialUseOf(entry) === use)?.path ?? null;
}

function toAddresses(list: MessageAddressObject[] | undefined): MailAddress[] {
  return (list ?? []).filter((entry) => entry.address).map((entry) => ({ name: entry.name ?? "", address: entry.address ?? "" }));
}

function hasAttachment(node: MessageStructureObject | undefined): boolean {
  if (!node) return false;
  if (node.disposition?.toLowerCase() === "attachment") return true;
  if (node.disposition?.toLowerCase() !== "inline" && (node.parameters?.name || node.dispositionParameters?.filename) && !node.type.startsWith("multipart/")) return true;
  return (node.childNodes ?? []).some(hasAttachment);
}

function toListItem(message: FetchMessageObject): MailListItem {
  const flags = message.flags ?? new Set<string>();
  const date = message.envelope?.date ?? message.internalDate ?? new Date(0);
  return {
    uid: message.uid,
    subject: message.envelope?.subject ?? "",
    from: toAddresses(message.envelope?.from),
    to: toAddresses(message.envelope?.to),
    date: new Date(date).toISOString(),
    seen: flags.has("\\Seen"),
    flagged: flags.has("\\Flagged"),
    answered: flags.has("\\Answered"),
    hasAttachments: hasAttachment(message.bodyStructure),
  };
}

const listQuery = { uid: true, envelope: true, flags: true, bodyStructure: true, internalDate: true } as const;

/** Newest first. With `query`, searches subject, sender, recipients and body on the server. */
export async function listMessages(client: ImapFlow, folder: string, options: { page: number; pageSize: number; query?: string; unreadOnly?: boolean }): Promise<MailListPage> {
  const lock = await client.getMailboxLock(folder, { readOnly: true }).catch((error) => {
    throw new MailError("not_found", (error as Error).message);
  });
  try {
    const mailbox = client.mailbox;
    const exists = mailbox ? mailbox.exists : 0;
    const { page, pageSize } = options;
    const query = options.query?.trim();
    if (!query && !options.unreadOnly) {
      const end = exists - page * pageSize;
      if (end < 1) return { items: [], total: exists, page, pageSize };
      const start = Math.max(1, end - pageSize + 1);
      const items: MailListItem[] = [];
      for await (const message of client.fetch(`${start}:${end}`, listQuery)) items.push(toListItem(message));
      items.sort((a, b) => b.uid - a.uid);
      return { items, total: exists, page, pageSize };
    }
    const criteria = {
      ...(options.unreadOnly ? { seen: false } : {}),
      ...(query ? { or: [{ subject: query }, { from: query }, { to: query }, { body: query }] } : {}),
    };
    const uids = ((await client.search(criteria, { uid: true })) || []).sort((a, b) => b - a);
    const slice = uids.slice(page * pageSize, (page + 1) * pageSize);
    const items: MailListItem[] = [];
    if (slice.length > 0) {
      for await (const message of client.fetch(slice, listQuery, { uid: true })) items.push(toListItem(message));
    }
    items.sort((a, b) => b.uid - a.uid);
    return { items, total: uids.length, page, pageSize };
  } finally {
    lock.release();
  }
}

function parsedAddresses(value: AddressObject | AddressObject[] | undefined): MailAddress[] {
  const groups = value ? (Array.isArray(value) ? value : [value]) : [];
  return groups.flatMap((group) => group.value.flatMap((entry) => (entry.group ?? [entry])))
    .filter((entry) => entry.address)
    .map((entry) => ({ name: entry.name ?? "", address: entry.address ?? "" }));
}

async function downloadSource(client: ImapFlow, uid: number): Promise<{ source: Buffer; flags: Set<string> }> {
  const meta = await client.fetchOne(String(uid), { uid: true, size: true }, { uid: true });
  if (!meta) throw new MailError("not_found");
  if ((meta.size ?? 0) > MAX_MESSAGE_BYTES) throw new MailError("too_large");
  const message = await client.fetchOne(String(uid), { uid: true, source: true, flags: true }, { uid: true });
  if (!message || !message.source) throw new MailError("not_found");
  return { source: message.source, flags: message.flags ?? new Set() };
}

async function parseSource(source: Buffer) {
  return simpleParser(source, { skipTextToHtml: true, skipTextLinks: true });
}

function visibleAttachments(parsed: Awaited<ReturnType<typeof parseSource>>) {
  // Inline images referenced by the HTML (cid:) were embedded as data: URLs by
  // mailparser; list only what the reader would call an attachment.
  return parsed.attachments.filter((attachment) => !attachment.related || attachment.contentDisposition === "attachment");
}

/** Reads one message in full and marks it as read. */
export async function readMessage(client: ImapFlow, folder: string, uid: number): Promise<MailMessage> {
  const lock = await client.getMailboxLock(folder).catch((error) => {
    throw new MailError("not_found", (error as Error).message);
  });
  try {
    const { source, flags } = await downloadSource(client, uid);
    if (!flags.has("\\Seen")) {
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true }).catch(() => undefined);
    }
    const parsed = await parseSource(source);
    const html = typeof parsed.html === "string" && parsed.html.trim() ? sanitizeMailHtml(parsed.html) : null;
    const attachments: MailAttachmentInfo[] = visibleAttachments(parsed).map((attachment, index) => ({
      index,
      filename: attachment.filename || `attachment-${index + 1}`,
      contentType: attachment.contentType || "application/octet-stream",
      size: attachment.size ?? attachment.content.length,
    }));
    const references = parsed.references ? (Array.isArray(parsed.references) ? parsed.references : [parsed.references]) : [];
    return {
      uid,
      folder,
      subject: parsed.subject ?? "",
      from: parsedAddresses(parsed.from),
      to: parsedAddresses(parsed.to),
      cc: parsedAddresses(parsed.cc),
      replyTo: parsedAddresses(parsed.replyTo),
      date: (parsed.date ?? new Date()).toISOString(),
      messageId: parsed.messageId ?? "",
      references,
      html,
      text: parsed.text ?? "",
      hasRemoteContent: html ? hasRemoteContent(html) : false,
      attachments,
      seen: true,
      flagged: flags.has("\\Flagged"),
    };
  } finally {
    lock.release();
  }
}

export async function readAttachment(client: ImapFlow, folder: string, uid: number, index: number) {
  const lock = await client.getMailboxLock(folder, { readOnly: true }).catch((error) => {
    throw new MailError("not_found", (error as Error).message);
  });
  try {
    const { source } = await downloadSource(client, uid);
    const attachment = visibleAttachments(await parseSource(source))[index];
    if (!attachment) throw new MailError("not_found");
    return {
      filename: attachment.filename || `attachment-${index + 1}`,
      contentType: attachment.contentType || "application/octet-stream",
      content: attachment.content,
    };
  } finally {
    lock.release();
  }
}

export async function setFlags(client: ImapFlow, folder: string, uids: number[], change: { seen?: boolean; flagged?: boolean }) {
  const lock = await client.getMailboxLock(folder);
  try {
    const range = uids.join(",");
    for (const [flag, value] of [["\\Seen", change.seen], ["\\Flagged", change.flagged]] as const) {
      if (value === true) await client.messageFlagsAdd(range, [flag], { uid: true });
      if (value === false) await client.messageFlagsRemove(range, [flag], { uid: true });
    }
  } finally {
    lock.release();
  }
}

export async function moveMessages(client: ImapFlow, folder: string, uids: number[], target: string) {
  const lock = await client.getMailboxLock(folder);
  try {
    await client.messageMove(uids.join(","), target, { uid: true });
  } finally {
    lock.release();
  }
}

/** Moves to the trash; deletes for good when already in the trash or there is none. */
export async function deleteMessages(client: ImapFlow, folder: string, uids: number[]): Promise<"trashed" | "deleted"> {
  const trash = await findSpecialFolder(client, "trash");
  if (trash && trash !== folder) {
    await moveMessages(client, folder, uids, trash);
    return "trashed";
  }
  const lock = await client.getMailboxLock(folder);
  try {
    await client.messageDelete(uids.join(","), { uid: true });
    return "deleted";
  } finally {
    lock.release();
  }
}

/** Files a copy of a sent message, as desktop clients do. */
export async function appendToSent(client: ImapFlow, raw: Buffer): Promise<boolean> {
  const sent = await findSpecialFolder(client, "sent");
  if (!sent) return false;
  return Boolean(await client.append(sent, raw, ["\\Seen"]));
}

export async function markAnswered(client: ImapFlow, folder: string, uid: number) {
  const lock = await client.getMailboxLock(folder);
  try {
    await client.messageFlagsAdd(String(uid), ["\\Answered"], { uid: true });
  } finally {
    lock.release();
  }
}
