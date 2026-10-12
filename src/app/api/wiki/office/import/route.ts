import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { MAX_UPLOAD_BYTES } from "@/lib/files";
import { limitedRequest } from "@/lib/request-body";
import { importOfficeDocx } from "@/modules/wiki/office/import";

/** DOCX upload → new office document. Answers `{ slug }` or `{ error }` (officeDocuments.importFailed.*). */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Forbidden" }, { status: 403 });
  // One file plus a few form fields.
  const bounded = await limitedRequest(request, MAX_UPLOAD_BYTES + 1024 * 1024);
  if (!bounded) return Response.json({ error: "tooLarge" }, { status: 413 });
  let formData: FormData;
  try {
    formData = await bounded.formData();
  } catch {
    return Response.json({ error: "notDocx" }, { status: 400 });
  }
  const result = await importOfficeDocx(formData, session.user.id);
  if ("error" in result) return Response.json(result, { status: result.error === "tooLarge" ? 413 : 400 });
  revalidatePath("/wiki", "layout");
  return Response.json(result);
}
