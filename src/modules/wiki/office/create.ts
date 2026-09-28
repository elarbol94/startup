import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { wikiPages } from "@/db/schema";
import { slugify } from "../lib/tiptap";
import { isPageSlugTaken } from "../queries";
import { withPageOfficeLock } from "./page-lock";
import { commitHeadVersion, type PreparedDocx } from "./store";

function uniqueSlug(title: string) {
  const base = slugify(title);
  for (let i = 1; i < 100; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!isPageSlugTaken(slug)) return slug;
  }
  throw new Error("Could not allocate a unique slug");
}

/** Creates a wiki page whose body is an office document, with `prepared` as version 1. */
export async function createOfficePage(input: {
  title: string; parentId: string | null; locale: "de" | "en"; prepared: PreparedDocx; kind: "create" | "import"; userId: string;
}) {
  if (input.parentId && !db.select({ id: wikiPages.id }).from(wikiPages).where(and(eq(wikiPages.id, input.parentId), isNull(wikiPages.deletedAt))).get()) {
    throw new Error("Parent page not found");
  }
  const row = db.insert(wikiPages).values({
    title: input.title,
    slug: uniqueSlug(input.title),
    parentId: input.parentId,
    status: "inbox",
    citationLocale: input.locale === "de" ? "de-DE" : "en-US",
    proofingLanguage: input.locale === "de" ? "de-AT" : "en-US",
    documentMode: true,
    documentEngine: "office",
    createdBy: input.userId,
    updatedBy: input.userId,
  }).returning({ id: wikiPages.id, slug: wikiPages.slug }).get();
  try {
    await withPageOfficeLock(row.id, () => commitHeadVersion(row.id, input.prepared, input.kind, input.userId));
  } catch (error) {
    db.delete(wikiPages).where(eq(wikiPages.id, row.id)).run();
    throw error;
  }
  return row;
}
