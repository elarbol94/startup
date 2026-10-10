import { scratchDocx } from "@/modules/wiki/office/blank-docx";
import { verifyScratchToken } from "@/modules/wiki/office/tokens";

/**
 * Blank DOCX for the section editor's scratch document, built in memory.
 * Authenticated only by the short-lived scratch token (the document server
 * fetches it over the internal network); nothing is read or stored.
 */
export async function GET(request: Request) {
  let claims;
  try {
    claims = verifyScratchToken(new URL(request.url).searchParams.get("token") ?? "");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const data = await scratchDocx(claims.locale);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Length": String(data.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
