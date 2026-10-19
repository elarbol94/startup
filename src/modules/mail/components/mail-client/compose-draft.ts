import { formatAddressList, quoteText, replyRecipients, replySubject, threadHeaders, type ReplyKind } from "../../mail-utils";
import type { MailAccountSummary, MailAttachmentInfo, MailMessage } from "../../types";

export type ComposeDraft = {
  accountId: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string[];
  source?: { folder: string; uid: number; kind: ReplyKind };
  /** Attachments of a forwarded message that can be passed on. */
  forwardable: MailAttachmentInfo[];
};

function withSignature(body: string, signature: string) {
  return signature.trim() ? `${body}\n\n-- \n${signature.trim()}` : body;
}

export function newDraft(account: MailAccountSummary, to = ""): ComposeDraft {
  return { accountId: account.id, to, cc: "", bcc: "", subject: "", text: withSignature("", account.signature), forwardable: [] };
}

/** Labels for the quote header, translated by the caller. */
export type QuoteLabels = {
  wrote: (values: { date: string; sender: string }) => string;
  forwarded: string;
  from: string;
  date: string;
  subject: string;
  to: string;
};

export function replyDraft(account: MailAccountSummary, message: MailMessage, kind: ReplyKind, labels: QuoteLabels, formatDate: (iso: string) => string): ComposeDraft {
  const recipients = replyRecipients(message, kind, account.emailAddress);
  const date = formatDate(message.date);
  const sender = formatAddressList(message.from);
  const original = message.text.trim() || "";
  const body = kind === "forward"
    ? [
      `---------- ${labels.forwarded} ----------`,
      `${labels.from}: ${sender}`,
      `${labels.date}: ${date}`,
      `${labels.subject}: ${message.subject}`,
      `${labels.to}: ${formatAddressList(message.to)}`,
      "",
      original,
    ].join("\n")
    : `${labels.wrote({ date, sender })}\n${quoteText(original)}`;
  return {
    accountId: account.id,
    to: formatAddressList(recipients.to),
    cc: formatAddressList(recipients.cc),
    bcc: "",
    subject: replySubject(message.subject, kind),
    text: `\n\n${account.signature.trim() ? `-- \n${account.signature.trim()}\n\n` : ""}${body}`,
    ...(kind === "forward" ? {} : threadHeaders(message)),
    source: { folder: message.folder, uid: message.uid, kind },
    forwardable: kind === "forward" ? message.attachments : [],
  };
}
