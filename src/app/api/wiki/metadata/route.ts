import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { fetchPublicText } from "@/lib/public-fetch";
import { normalizeIsbn, normalizeUrl } from "@/modules/wiki/lib/citations";
import { fetchCrossrefWork } from "@/modules/wiki/lib/crossref";

const lookupSchema = z.object({
  kind: z.enum(["doi", "isbn", "url"]),
  value: z.string().trim().min(1).max(2_000),
  accessedAt: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(date.getTime())
        && date.toISOString().slice(0, 10) === value;
    })
    .optional(),
});

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ];
  return patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean) ?? "";
}

function decode(value: string) { return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }

export async function POST(request: Request) {
  if (!await getSession()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = lookupSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid metadata lookup" }, { status: 400 });
  }
  const { kind, value, accessedAt } = parsed.data;
  try {
    if (kind === "doi") {
      return NextResponse.json(await fetchCrossrefWork(value));
    }
    if (kind === "isbn") {
      const isbn = normalizeIsbn(value); const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`, { signal: AbortSignal.timeout(8_000) }); if (!response.ok) throw new Error("ISBN metadata was not found"); const body = await response.json(); const item = body[`ISBN:${isbn}`]; if (!item) throw new Error("ISBN metadata was not found");
      return NextResponse.json({ type: "book", title: item.title ?? "", subtitle: item.subtitle ?? "", issuedDate: String(item.publish_date ?? ""), publisher: item.publishers?.[0]?.name ?? "", isbn, url: item.url ? `https://openlibrary.org${item.url}` : "", contributors: (item.authors ?? []).map((person: { name?: string }) => ({ role: "author", given: "", family: "", literal: person.name ?? "" })) });
    }
    const page = await fetchPublicText(normalizeUrl(value), { maxBytes: 1_000_000, headers: { "User-Agent": "CompanyHQ/0.1" } }); if (!page.contentType.includes("text/html")) throw new Error("URL does not point to an HTML page"); const html = page.body; const title = meta(html, "og:title") || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "";
    return NextResponse.json({ type: "webPage", title: decode(title.trim()), abstract: decode(meta(html, "description") || meta(html, "og:description")), issuedDate: meta(html, "article:published_time").slice(0, 10), publisher: decode(meta(html, "og:site_name")), url: page.finalUrl, accessedAt: accessedAt ?? new Date().toISOString().slice(0, 10), contributors: [] });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Lookup failed" }, { status: 400 }); }
}
