import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { readAttachment } from "@/modules/mail/imap";
import { runOnMailbox } from "@/modules/mail/mailbox";

const query = z.object({
  account: z.string().min(1).max(64),
  folder: z.string().min(1).max(1_000),
  uid: z.coerce.number().int().positive(),
  index: z.coerce.number().int().min(0).max(500),
  download: z.enum(["1"]).optional(),
});

/** Inline-safe types a browser may show directly; everything else is downloaded. */
const inlineTypes = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain)$/i;

/** Streams one attachment of a message in the user's mailbox. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { account, folder, uid, index, download } = parsed.data;

  const result = await runOnMailbox(session.user.id, account, (client) => readAttachment(client, folder, uid, index));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === "not_found" ? 404 : 502 });

  const { filename, contentType, content } = result.value;
  const inline = !download && inlineTypes.test(contentType);
  return new NextResponse(new Uint8Array(content), {
    headers: {
      "Content-Type": inline ? contentType : "application/octet-stream",
      "Content-Length": String(content.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
