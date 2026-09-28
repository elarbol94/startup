import { getSession } from "@/lib/auth";
import { searchPages } from "@/modules/wiki/queries";

/** Page picker for the ONLYOFFICE plugin's "link wiki page" command. */
export async function GET(request: Request) {
  if (!await getSession()) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ pages: searchPages(query, 15).map((page) => ({ title: page.title, slug: page.slug, href: `/wiki/pages/${encodeURIComponent(page.slug)}` })) });
}
