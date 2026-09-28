"use server";

import { and, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { user, wikiNotifications } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { MAX_UPLOAD_BYTES } from "@/lib/files";
import { blankDocx } from "./blank-docx";
import { requireOfficeConfig } from "./config";
import { createOfficePage } from "./create";
import { DocxLimitError } from "./docx-safety";
import { defaultOperationDeps, startCheckpoint, startRestore } from "./operations";
import { getOfficePage } from "./queries";
import { OfficeConflictError } from "./sessions";
import { DOCX_MIME, prepareDocx } from "./store";
import { mentionEmail, mentionEmailUserId } from "./users";

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  parentId: z.string().min(1).nullable().default(null),
  locale: z.enum(["de", "en"]).default("de"),
});

export async function createOfficeDocument(input: z.input<typeof createSchema>) {
  const currentUser = await requireUserOrThrow();
  const data = createSchema.parse(input);
  const prepared = prepareDocx(await blankDocx(data.title, data.locale));
  const page = await createOfficePage({ ...data, prepared, kind: "create", userId: currentUser.id });
  revalidatePath("/wiki", "layout");
  return { slug: page.slug };
}

/** Uploads a DOCX as a new office document (lossless, unlike the TipTap import). */
export async function importOfficeDocument(formData: FormData) {
  const currentUser = await requireUserOrThrow();
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("File missing");
  if (file.size > MAX_UPLOAD_BYTES) return { error: "tooLarge" as const };
  if (file.type && file.type !== DOCX_MIME) return { error: "notDocx" as const };
  const data = createSchema.parse({
    title: String(formData.get("title") ?? "").trim() || file.name.replace(/\.docx$/i, "").slice(0, 200) || "Dokument",
    parentId: formData.get("parentId") || null,
    locale: formData.get("locale") ?? "de",
  });
  let prepared;
  try {
    prepared = prepareDocx(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof DocxLimitError) return { error: "invalidDocx" as const };
    throw error;
  }
  const page = await createOfficePage({ ...data, prepared, kind: "import", userId: currentUser.id });
  revalidatePath("/wiki", "layout");
  return { slug: page.slug };
}

const pageSchema = z.object({ pageId: z.string().min(1) });

function officePageOrThrow(pageId: string) {
  const page = getOfficePage(pageId);
  if (!page || page.engine !== "office") throw new Error("Document not found");
  return page;
}

export async function restoreOfficeVersion(input: { pageId: string; versionId: string }) {
  const currentUser = await requireUserOrThrow();
  const data = pageSchema.extend({ versionId: z.string().min(1) }).parse(input);
  const page = officePageOrThrow(data.pageId);
  try {
    const operation = await startRestore(page.id, data.versionId, currentUser.id, defaultOperationDeps(requireOfficeConfig()));
    console.info(JSON.stringify({ event: "office_restore", pageId: page.id, versionId: data.versionId, userId: currentUser.id, state: operation.state, reason: operation.failureReason }));
    if (operation.state === "done") revalidatePath(`/wiki/pages/${page.slug}`);
    return { state: operation.state, reason: operation.failureReason };
  } catch (error) {
    if (error instanceof OfficeConflictError) return { state: "failed" as const, reason: error.code };
    throw error;
  }
}

export async function saveOfficeCheckpoint(input: { pageId: string }) {
  const currentUser = await requireUserOrThrow();
  const page = officePageOrThrow(pageSchema.parse(input).pageId);
  try {
    const operation = await startCheckpoint(page.id, currentUser.id, defaultOperationDeps(requireOfficeConfig()));
    return { state: operation.state, reason: operation.failureReason, stored: operation.lastCommandResult === "stored" };
  } catch (error) {
    if (error instanceof OfficeConflictError) return { state: "failed" as const, reason: error.code, stored: false };
    throw error;
  }
}

const mentionSchema = pageSchema.extend({ emails: z.array(z.string().max(320)).max(50) });

/** ONLYOFFICE comment @mentions (onRequestSendNotify) → wiki notifications. */
export async function notifyOfficeMentions(input: z.input<typeof mentionSchema>) {
  const currentUser = await requireUserOrThrow();
  const data = mentionSchema.parse(input);
  const page = officePageOrThrow(data.pageId);
  const ids = [...new Set(data.emails.map(mentionEmailUserId).filter((id): id is string => Boolean(id) && id !== currentUser.id))];
  if (!ids.length) return { notified: 0 };
  const recipients = db.select({ id: user.id }).from(user).where(and(inArray(user.id, ids), isNull(user.removedAt))).all();
  for (const recipient of recipients) {
    db.insert(wikiNotifications).values({ userId: recipient.id, actorId: currentUser.id, type: "mention", pageId: page.id }).run();
  }
  if (recipients.length) revalidatePath("/wiki", "layout");
  return { notified: recipients.length };
}

export async function officeMentionUsers() {
  await requireUserOrThrow();
  return db.select({ id: user.id, name: user.name }).from(user).where(isNull(user.removedAt)).all()
    .map((person) => ({ id: person.id, name: person.name, email: mentionEmail(person.id) }));
}
