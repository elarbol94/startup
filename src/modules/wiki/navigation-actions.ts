"use server";

import { z } from "zod";
import { requireUserOrThrow } from "@/lib/auth";
import { getWikiNavigationItems, resolveWikiNavigationPaths } from "./navigation-queries";
import { searchResearch } from "./research-actions";

export async function resolveWikiNavigationItems(paths: string[]) {
  const viewer = await requireUserOrThrow();
  return resolveWikiNavigationPaths(viewer, z.array(z.string().max(1000)).max(50).parse(paths));
}

export async function searchWikiNavigation(query: string, recentPaths: string[] = []) {
  const viewer = await requireUserOrThrow();
  const clean = z.string().trim().max(200).parse(query);
  const latest = getWikiNavigationItems(viewer, clean);
  const recent = clean ? [] : resolveWikiNavigationPaths(viewer, z.array(z.string().max(1000)).max(30).parse(recentPaths));
  const items = [...recent, ...latest.filter((item) => !recent.some((other) => other.href === item.href))];
  const content = clean ? await searchResearch(clean, { limit: 30 }) : null;
  const seen = new Set(items.map((item) => item.href));
  return [...items.map((item) => ({ ...item, snippet: "" })), ...(content?.results ?? []).filter((hit) => !seen.has(hit.href)).map((hit) => ({ id: hit.key, title: hit.title, href: hit.href, kind: hit.kind === "page" ? "document" as const : "source" as const, updatedAt: 0, snippet: hit.snippet }))];
}
