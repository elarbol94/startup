import "server-only";

import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { MailError, resolveMailHost, toMailError, type MailCredentials, type MailTarget } from "./connection";
import { formatAddress } from "./mail-utils";
import type { MailAddress } from "./types";

export type OutgoingMail = {
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string[];
  attachments: { filename: string; contentType: string; content: Buffer }[];
};

function transportFor(credentials: MailCredentials, target: MailTarget) {
  return nodemailer.createTransport({
    ...target,
    port: credentials.smtpPort,
    secure: credentials.smtpSecurity === "tls",
    requireTLS: credentials.smtpSecurity === "starttls",
    auth: { user: credentials.username, pass: credentials.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

/** Logs in to the SMTP server without sending, to check new account settings. */
export async function verifySmtpLogin(credentials: MailCredentials): Promise<void> {
  const transport = transportFor(credentials, await resolveMailHost(credentials.smtpHost));
  try {
    await transport.verify();
  } catch (error) {
    throw toMailError(error);
  } finally {
    transport.close();
  }
}

/**
 * Sends the message and returns its raw form, so the caller can file a copy
 * in the Sent folder, plus any recipients the server refused while accepting
 * the others. Bcc recipients are in the envelope only, never in the
 * raw message.
 */
export async function sendOutgoingMail(credentials: MailCredentials, mail: OutgoingMail): Promise<{ raw: Buffer; rejected: string[] }> {
  if (mail.to.length + mail.cc.length + mail.bcc.length === 0) throw new MailError("recipient_rejected", "No recipients");
  const target = await resolveMailHost(credentials.smtpHost);
  const from = { name: credentials.displayName, address: credentials.emailAddress };
  const composer = new MailComposer({
    from: formatAddress(from),
    to: mail.to.map(formatAddress),
    cc: mail.cc.map(formatAddress),
    subject: mail.subject,
    text: mail.text,
    inReplyTo: mail.inReplyTo,
    references: mail.references,
    attachments: mail.attachments.map((attachment) => ({ filename: attachment.filename, contentType: attachment.contentType, content: attachment.content })),
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  const raw = await composer.compile().build();
  const transport = transportFor(credentials, target);
  try {
    const result = await transport.sendMail({
      envelope: {
        from: credentials.emailAddress,
        to: [...mail.to, ...mail.cc, ...mail.bcc].map((entry) => entry.address),
      },
      raw,
    });
    const rejected = result.rejected.map(String);
    if (result.accepted.length === 0) throw new MailError("recipient_rejected", rejected.join(", "));
    return { raw, rejected };
  } catch (error) {
    const mapped = toMailError(error);
    throw mapped.code === "unknown" ? new MailError("send_failed", mapped.message) : mapped;
  } finally {
    transport.close();
  }
}
