"use server";

import { z } from "zod";
import { requireUserOrThrow } from "@/lib/auth";
import { getPageBySlug } from "./queries";
import { parseStoredDocument } from "./lib/tiptap";
import { tiptapOutline, type WikiOutlineSection } from "./lib/presentation-wiki-import";
import { headVersion, readVersionFile } from "./office/store";
import { unzipDocxBounded } from "./office/docx-safety";
import { docxOutline } from "./office/docx-outline";

/**
 * The heading outline of a wiki document, for filling a presentation detail page. Every
 * signed-in user can read every wiki page, so the page itself needs no further check. Takes
 * the page's link, which is what the wiki's own page search hands out.
 */
export async function getWikiPageOutline(input: { href: string }): Promise<{ title: string; sections: WikiOutlineSection[] }> {
  await requireUserOrThrow();
  const { href } = z.object({ href: z.string().max(1000) }).parse(input);
  const slug = /^\/wiki\/pages\/([a-z0-9-]+)\/?$/.exec(href)?.[1];
  const page = slug ? getPageBySlug(slug) : undefined;
  if (!page) throw new Error("Page not found");
  if (page.documentEngine === "office") {
    const head = headVersion(page.id);
    return { title: page.title, sections: head ? docxOutline(unzipDocxBounded(readVersionFile(head.attachmentId))) : [] };
  }
  return { title: page.title, sections: page.documentEngine === "tiptap" ? tiptapOutline(parseStoredDocument(page.contentJson ?? "")) : [] };
}
