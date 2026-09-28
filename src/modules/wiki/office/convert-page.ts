import { and, eq, isNull } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { wikiOfficeDocuments, wikiOfficeVersions, wikiPageRevisions, wikiPages } from "@/db/schema";
import { commitFrozenRoom } from "../collaboration/store";
import { freezeLiveDocument } from "../collaboration/live-registry";
import { currentPageDocument, planConversion, type ConversionIssue } from "./convert";
import { withPageOfficeLock } from "./page-lock";
import { commitHeadVersion } from "./store";

export type ConversionResult =
  | { ok: true; pageId: string; title: string }
  | { ok: false; pageId: string; title: string; reason: "notConvertible" | "failed"; issues: ConversionIssue[]; message?: string };

function dropRoom(pageId: string) {
  // Updates and presence cascade with the room.
  sqlite.prepare("DELETE FROM wiki_collaboration_rooms WHERE key = ?").run(`page:${pageId}`);
}

/**
 * Converts one TipTap document page to an office (DOCX) document, inside the
 * running app (it owns the live collaboration rooms):
 * 1. mark `converting` — every TipTap/Yjs writer refuses from now on;
 * 2. end live editing and commit what was only in memory;
 * 3. keep the final TipTap body as a `conversion` revision (read-only view);
 * 4. convert and verify (planConversion); on any problem restore `tiptap`;
 * 5. store version 1 and switch the engine, dropping the room.
 */
export function convertPageToOffice(pageId: string, userId: string, origin: string): Promise<ConversionResult> {
  return withPageOfficeLock(pageId, async () => {
    const page = db.select().from(wikiPages).where(and(eq(wikiPages.id, pageId), isNull(wikiPages.deletedAt))).get();
    if (!page) throw new Error("Page not found");
    if (page.documentEngine !== "tiptap") return { ok: false, pageId, title: page.title, reason: "failed", issues: [], message: "notTiptap" };

    const marked = db.update(wikiPages).set({ documentEngine: "converting", conversionStartedAt: new Date() })
      .where(and(eq(wikiPages.id, pageId), eq(wikiPages.documentEngine, "tiptap"))).run();
    if (!marked.changes) return { ok: false, pageId, title: page.title, reason: "failed", issues: [], message: "notTiptap" };

    const revert = () => db.update(wikiPages).set({ documentEngine: "tiptap", conversionStartedAt: null }).where(eq(wikiPages.id, pageId)).run();
    try {
      const inMemory = freezeLiveDocument("page", pageId);
      if (inMemory) commitFrozenRoom(pageId, inMemory);

      const plan = await planConversion(pageId, { origin });
      if (!plan.ok) {
        revert();
        return { ok: false, pageId, title: page.title, reason: "notConvertible", issues: plan.issues };
      }
      const { doc, settings } = currentPageDocument(pageId, page.contentJson, page.documentSettingsJson);
      const finalJson = JSON.stringify(doc);
      commitHeadVersion(pageId, plan.prepared, "conversion", userId, {
        engine: "office",
        inTransaction: () => {
          db.insert(wikiPageRevisions).values({
            pageId, version: page.version, contentVersion: page.contentVersion, title: page.title,
            contentJson: finalJson, status: page.status, citationLocale: page.citationLocale, citationStyle: page.citationStyle,
            documentMode: true, documentSettingsJson: JSON.stringify(settings), documentTemplateId: page.documentTemplateId,
            kind: "conversion", label: "Vor der Umstellung auf Word", createdBy: userId,
          }).run();
          // The stored TipTap body stays readable (read-only HTML of the last state).
          db.update(wikiPages).set({ contentJson: finalJson, conversionStartedAt: null }).where(eq(wikiPages.id, pageId)).run();
          dropRoom(pageId);
        },
      });
      console.info(JSON.stringify({ event: "office_conversion_done", pageId, userId }));
      return { ok: true, pageId, title: page.title };
    } catch (error) {
      revert();
      console.error(JSON.stringify({ event: "office_conversion_failed", pageId, reason: error instanceof Error ? error.message : String(error) }));
      return { ok: false, pageId, title: page.title, reason: "failed", issues: [], message: error instanceof Error ? error.message : String(error) };
    }
  });
}

/** Startup: finish or undo conversions interrupted by a restart. */
export function recoverInterruptedConversions() {
  const stuck = db.select({ id: wikiPages.id }).from(wikiPages).where(eq(wikiPages.documentEngine, "converting")).all();
  for (const page of stuck) {
    const converted = db.select({ id: wikiOfficeVersions.id }).from(wikiOfficeDocuments)
      .innerJoin(wikiOfficeVersions, eq(wikiOfficeVersions.id, wikiOfficeDocuments.headVersionId))
      .where(eq(wikiOfficeDocuments.pageId, page.id)).get();
    db.transaction(() => {
      db.update(wikiPages).set({ documentEngine: converted ? "office" : "tiptap", conversionStartedAt: null }).where(eq(wikiPages.id, page.id)).run();
      if (converted) dropRoom(page.id);
    });
    console.warn(JSON.stringify({ event: "office_conversion_recovered", pageId: page.id, result: converted ? "office" : "tiptap" }));
  }
}
