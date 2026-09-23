import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, entries, invoices } from "@/db/schema";
import type { AttachmentEntityType } from "@/lib/files";
import { presentationRole } from "@/modules/wiki/presentation-access";

export type AttachmentAccess = "read" | "upload" | "delete";
type Viewer = { id: string; role?: string | null };

/**
 * Single authorization gate for the generic file API. Returns the HTTP status
 * to refuse with, or null when the viewer may perform the access.
 * Booked accounting records keep their receipts (retention), and payroll
 * receipts stay limited to the roles that may see personnel data.
 */
export function attachmentAccessError(
  viewer: Viewer,
  entityType: AttachmentEntityType,
  entityId: string,
  access: AttachmentAccess,
): 403 | 404 | null {
  switch (entityType) {
    case "entry": {
      const row = db
        .select({ status: entries.status, template: categories.template })
        .from(entries)
        .innerJoin(categories, eq(entries.categoryId, categories.id))
        .where(eq(entries.id, entityId))
        .get();
      if (!row) return 404;
      if (row.template === "personnel" && viewer.role !== "admin" && viewer.role !== "personnel") return 404;
      if (access === "upload" && row.status === "voided") return 403;
      if (access === "delete" && row.status !== "draft") return 403;
      return null;
    }
    case "invoice": {
      const row = db.select({ status: invoices.status }).from(invoices).where(eq(invoices.id, entityId)).get();
      if (!row) return 404;
      if (access === "delete" && row.status !== "draft") return 403;
      return null;
    }
    case "wikiPresentation": {
      const role = presentationRole(entityId, viewer);
      if (!role) return 404;
      if (access !== "read" && role !== "edit" && role !== "owner") return 403;
      return null;
    }
    case "wikiPresentationLibrary":
      // Managed exclusively through the design library actions.
      return access === "read" ? null : 403;
    default:
      return null;
  }
}
