import { z } from "zod";
import { MAX_UPLOAD_BYTES } from "@/lib/files";
import { createOfficePage } from "./create";
import { DocxLimitError } from "./docx-safety";
import { DOCX_MIME, prepareDocx } from "./store";

export type OfficeImportError = "tooLarge" | "notDocx" | "invalidDocx";

const importSchema = z.object({
  title: z.string().trim().min(1).max(200),
  parentId: z.string().min(1).nullable().default(null),
  locale: z.enum(["de", "en"]).default("de"),
});

/**
 * Uploads a DOCX as a new office document (lossless, unlike the TipTap import).
 * Served by POST /api/wiki/office/import: a route handler, not a server action,
 * so the 50 MB upload limit does not raise the 1 MB limit of every action.
 */
export async function importOfficeDocx(formData: FormData, userId: string): Promise<{ slug: string } | { error: OfficeImportError }> {
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "notDocx" };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "tooLarge" };
  if (file.type && file.type !== DOCX_MIME) return { error: "notDocx" };
  const data = importSchema.parse({
    title: String(formData.get("title") ?? "").trim() || file.name.replace(/\.docx$/i, "").slice(0, 200) || "Dokument",
    parentId: formData.get("parentId") || null,
    locale: formData.get("locale") ?? "de",
  });
  let prepared;
  try {
    prepared = prepareDocx(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    if (error instanceof DocxLimitError) return { error: "invalidDocx" };
    throw error;
  }
  const page = await createOfficePage({ ...data, prepared, kind: "import", userId });
  return { slug: page.slug };
}
