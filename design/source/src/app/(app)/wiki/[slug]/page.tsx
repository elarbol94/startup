import { redirect } from "next/navigation";
import { connection } from "next/server";
export default async function LegacyWikiPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const destination = new URL(`/wiki/pages/${encodeURIComponent(slug)}`, "https://workspace.invalid");
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) destination.searchParams.append(key, item);
  }
  redirect(`${destination.pathname}${destination.search}`);
}
