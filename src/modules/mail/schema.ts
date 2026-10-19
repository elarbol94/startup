import { createId } from "@paralleldrive/cuid2";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "@/db/core-schema";

export const smtpSecurityModes = ["tls", "starttls"] as const;
export type SmtpSecurity = (typeof smtpSecurityModes)[number];

/**
 * A mailbox a user connected to the Mail section (IMAP for reading, SMTP for
 * sending). Messages are not copied into the platform: every view reads the
 * mailbox live. Private to its owner; the password is stored encrypted (see
 * crypto.ts) and never leaves the server.
 */
export const mailAccounts = sqliteTable(
  "mail_accounts",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    /** Address shown as sender, e.g. "felix@example.com". */
    emailAddress: text("email_address").notNull(),
    /** Name shown as sender, e.g. "Felix Wicha". */
    displayName: text("display_name").notNull().default(""),
    imapHost: text("imap_host").notNull(),
    imapPort: integer("imap_port").notNull().default(993),
    /** Implicit TLS (993) when true, STARTTLS otherwise. */
    imapSecure: integer("imap_secure", { mode: "boolean" }).notNull().default(true),
    smtpHost: text("smtp_host").notNull(),
    smtpPort: integer("smtp_port").notNull().default(465),
    smtpSecurity: text("smtp_security", { enum: smtpSecurityModes }).notNull().default("tls"),
    username: text("username").notNull(),
    /** AES-256-GCM ciphertext of the password (crypto.ts). */
    passwordEncrypted: text("password_encrypted").notNull(),
    /** Signature appended to new messages and replies (plain text). */
    signature: text("signature").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("mail_accounts_user_idx").on(table.userId)],
);

export type MailAccountRow = typeof mailAccounts.$inferSelect;
