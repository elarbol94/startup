// Shapes shared by the mail server code and the client components.
import type { SmtpSecurity } from "./schema";

export type MailAccountSummary = {
  id: string;
  emailAddress: string;
  displayName: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: SmtpSecurity;
  username: string;
  signature: string;
};

export type MailSpecialUse = "inbox" | "sent" | "drafts" | "trash" | "junk" | "archive" | "flagged" | "all";

export type MailFolder = {
  path: string;
  name: string;
  /** Nesting depth below the root, for indentation. */
  depth: number;
  specialUse: MailSpecialUse | null;
  total: number;
  unseen: number;
  /** \Noselect folders only group children and cannot be opened. */
  selectable: boolean;
};

export type MailAddress = { name: string; address: string };

export type MailListItem = {
  uid: number;
  subject: string;
  from: MailAddress[];
  to: MailAddress[];
  /** ISO timestamp */
  date: string;
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  hasAttachments: boolean;
};

export type MailListPage = {
  items: MailListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type MailAttachmentInfo = {
  index: number;
  filename: string;
  contentType: string;
  size: number;
};

export type MailMessage = {
  uid: number;
  folder: string;
  subject: string;
  from: MailAddress[];
  to: MailAddress[];
  cc: MailAddress[];
  replyTo: MailAddress[];
  date: string;
  messageId: string;
  references: string[];
  /** Sanitised HTML body (no scripts, forms or event handlers), or null for text-only mail. */
  html: string | null;
  text: string;
  hasRemoteContent: boolean;
  attachments: MailAttachmentInfo[];
  seen: boolean;
  flagged: boolean;
};

export type MailErrorCode =
  | "auth_failed"
  | "connection_failed"
  | "tls_failed"
  | "not_found"
  | "send_failed"
  | "recipient_rejected"
  | "too_large"
  | "unknown";

export type MailResult<T> = { ok: true; value: T } | { ok: false; error: MailErrorCode; detail?: string };
