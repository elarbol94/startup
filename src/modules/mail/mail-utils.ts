// Pure helpers for composing replies and handling address lists. Used on the
// client (compose dialog) and the server (send validation).
import type { MailAddress, MailMessage } from "./types";

export type ReplyKind = "reply" | "replyAll" | "forward";

const replyPrefix = /^\s*((re|aw|antw|sv|vs)\s*(\[\d+\])?\s*:\s*)+/i;
const forwardPrefix = /^\s*((fwd?|wg|wtr|tr)\s*:\s*)+/i;

export function replySubject(subject: string, kind: ReplyKind): string {
  const base = subject.trim();
  if (kind === "forward") return `Fwd: ${base.replace(forwardPrefix, "")}`.trim();
  return replyPrefix.test(base) ? base : `Re: ${base}`.trim();
}

export function formatAddress(address: MailAddress): string {
  if (!address.name || address.name === address.address) return address.address;
  const name = /[",;<>@()]/.test(address.name) ? `"${address.name.replace(/(["\\])/g, "\\$1")}"` : address.name;
  return `${name} <${address.address}>`;
}

export function formatAddressList(addresses: MailAddress[]): string {
  return addresses.map(formatAddress).join(", ");
}

const emailPattern = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;

export function isEmailAddress(value: string): boolean {
  return emailPattern.test(value) && value.length <= 254;
}

/** Splits on commas/semicolons that are not inside quotes. */
function splitAddressInput(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of input) {
    if (char === '"') quoted = !quoted;
    if (!quoted && (char === "," || char === ";" || char === "\n")) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * Parses what a user typed into a To/Cc/Bcc field: `a@b.at, "Doe, Jane" <jane@x.com>; bob@y.de`.
 * Returns the addresses and the entries that are not valid addresses.
 */
export function parseAddressList(input: string): { addresses: MailAddress[]; invalid: string[] } {
  const addresses: MailAddress[] = [];
  const invalid: string[] = [];
  for (const part of splitAddressInput(input)) {
    const angle = part.match(/^(.*)<([^<>]+)>\s*$/);
    const address = (angle ? angle[2] : part).trim();
    const name = angle ? angle[1].trim().replace(/^"(.*)"$/, "$1").replace(/\\(["\\])/g, "$1") : "";
    if (isEmailAddress(address)) addresses.push({ name, address });
    else invalid.push(part);
  }
  return { addresses, invalid };
}

function sameAddress(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function uniqueAddresses(list: MailAddress[], exclude: string[]): MailAddress[] {
  const seen = new Set(exclude.map((value) => value.toLowerCase()));
  const result: MailAddress[] = [];
  for (const entry of list) {
    const key = entry.address.toLowerCase();
    if (!entry.address || seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
}

/** To/Cc for a reply: the sender (or Reply-To); for "reply all" also everyone else except the user. */
export function replyRecipients(message: Pick<MailMessage, "from" | "to" | "cc" | "replyTo">, kind: ReplyKind, ownAddress: string): { to: MailAddress[]; cc: MailAddress[] } {
  if (kind === "forward") return { to: [], cc: [] };
  const sentByMe = message.from.some((entry) => sameAddress(entry.address, ownAddress));
  // Replying to one's own sent message continues the thread with its recipients.
  const primary = sentByMe ? message.to : message.replyTo.length > 0 ? message.replyTo : message.from;
  const to = uniqueAddresses(primary, sentByMe ? [] : [ownAddress]);
  if (kind === "reply") return { to: to.length > 0 ? to : uniqueAddresses(primary, []), cc: [] };
  const cc = uniqueAddresses([...message.to, ...message.cc], [ownAddress, ...to.map((entry) => entry.address)]);
  return { to, cc };
}

/** In-Reply-To and References headers that keep a reply in the same thread. */
export function threadHeaders(message: Pick<MailMessage, "messageId" | "references">): { inReplyTo?: string; references?: string[] } {
  if (!message.messageId) return {};
  return { inReplyTo: message.messageId, references: [...message.references.filter((id) => id !== message.messageId), message.messageId].slice(-20) };
}

/** Prefixes every line with "> " as plain-text clients expect. */
export function quoteText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n").map((line) => (line.startsWith(">") ? `>${line}` : `> ${line}`)).join("\n");
}

/** Initials for the avatar of a sender. */
export function senderInitials(address: MailAddress | undefined): string {
  const source = (address?.name || address?.address || "?").replace(/@.*/, "");
  const words = source.split(/[\s._-]+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : source.slice(0, 2);
  return letters.toUpperCase();
}
