import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { limitedRequest } from "@/lib/request-body";
import { appendToSent, markAnswered, readAttachment } from "@/modules/mail/imap";
import { runOnMailbox } from "@/modules/mail/mailbox";
import { parseAddressList } from "@/modules/mail/mail-utils";
import { providerStoresSentMail } from "@/modules/mail/presets";
import { sendOutgoingMail, type OutgoingMail } from "@/modules/mail/smtp";

/** Most providers refuse messages above ~25 MB; base64 adds a third on top of the files. */
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const fields = z.object({
  accountId: z.string().min(1).max(64),
  to: z.string().max(10_000).default(""),
  cc: z.string().max(10_000).default(""),
  bcc: z.string().max(10_000).default(""),
  subject: z.string().max(998).default(""),
  text: z.string().max(2_000_000).default(""),
  inReplyTo: z.string().max(998).optional(),
  references: z.string().max(20_000).optional(),
  /** The message being answered (marked \Answered) or forwarded (its attachments can be included). */
  sourceFolder: z.string().max(1_000).optional(),
  sourceUid: z.coerce.number().int().positive().optional(),
  sourceKind: z.enum(["reply", "replyAll", "forward"]).optional(),
  forwardAttachments: z.string().max(2_000).optional(),
});

/** Sends a message from one of the user's mail accounts (multipart form, files under "attachments"). */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ ok: false, error: "unknown" }, { status: 401 });

  const bounded = await limitedRequest(request, MAX_ATTACHMENT_BYTES * 1.4 + 3 * 1024 * 1024);
  if (!bounded) return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  const form = await bounded.formData();
  const parsed = fields.safeParse(Object.fromEntries([...form.entries()].filter(([, value]) => typeof value === "string")));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "unknown", detail: "invalid input" }, { status: 400 });
  const data = parsed.data;

  const recipients = { to: parseAddressList(data.to), cc: parseAddressList(data.cc), bcc: parseAddressList(data.bcc) };
  const invalid = [...recipients.to.invalid, ...recipients.cc.invalid, ...recipients.bcc.invalid];
  if (invalid.length > 0) return NextResponse.json({ ok: false, error: "recipient_rejected", detail: invalid.join(", ") }, { status: 400 });

  const files = form.getAll("attachments").filter((value): value is File => value instanceof File);
  let total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_ATTACHMENT_BYTES) return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  const attachments: OutgoingMail["attachments"] = await Promise.all(files.map(async (file) => ({
    filename: file.name || "attachment",
    contentType: file.type || "application/octet-stream",
    content: Buffer.from(await file.arrayBuffer()),
  })));
  const forwardIndexes = (data.forwardAttachments ?? "").split(",").filter(Boolean).map(Number).filter((value) => Number.isInteger(value) && value >= 0).slice(0, 50);
  let references: string[] | undefined;
  try {
    references = data.references ? z.array(z.string().max(998)).max(50).parse(JSON.parse(data.references)) : undefined;
  } catch {
    references = undefined;
  }

  const result = await runOnMailbox(session.user.id, data.accountId, async (client, account, credentials) => {
    if (data.sourceKind === "forward" && data.sourceFolder && data.sourceUid && forwardIndexes.length > 0) {
      for (const index of forwardIndexes) {
        const original = await readAttachment(client, data.sourceFolder, data.sourceUid, index);
        total += original.content.length;
        if (total > MAX_ATTACHMENT_BYTES) return { tooLarge: true as const };
        attachments.push(original);
      }
    }
    const sent = await sendOutgoingMail(credentials, {
      to: recipients.to.addresses,
      cc: recipients.cc.addresses,
      bcc: recipients.bcc.addresses,
      subject: data.subject,
      text: data.text,
      inReplyTo: data.inReplyTo || undefined,
      references,
      attachments,
    });
    // After delivery nothing below may fail the request: the mail is already out.
    let filed = providerStoresSentMail(account.smtpHost);
    if (!filed) filed = await appendToSent(client, sent.raw).catch(() => false);
    if (data.sourceKind && data.sourceKind !== "forward" && data.sourceFolder && data.sourceUid) {
      await markAnswered(client, data.sourceFolder, data.sourceUid).catch(() => undefined);
    }
    return { tooLarge: false as const, rejected: sent.rejected, filed };
  });

  if (!result.ok) return NextResponse.json(result, { status: 502 });
  if (result.value.tooLarge) return NextResponse.json({ ok: false, error: "too_large" }, { status: 413 });
  return NextResponse.json({ ok: true, value: { rejected: result.value.rejected, filed: result.value.filed } });
}
