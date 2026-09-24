import type { SessionUser } from "@/lib/auth";
import { canManagePersonnel } from "@/modules/personnel/queries";

/** Admins and the personnel role may view and correct everyone's time. */
export function canManageTime(viewer: SessionUser) {
  return canManagePersonnel(viewer);
}

export function canWriteTimeFor(viewer: SessionUser, userId: string) {
  return viewer.id === userId || canManageTime(viewer);
}
