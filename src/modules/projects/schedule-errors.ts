/**
 * Expected scheduling failures. Next.js strips `Error.message` from server
 * actions in production builds, so actions translate a `ScheduleError` into a
 * `{ ok: false, code }` result that the client maps to a localized message.
 * Anything else is an unexpected fault and is rethrown.
 */
export type ScheduleErrorCode =
  /** A dependency or hierarchy change would create a cycle. */
  | "cycle"
  /** A dependency or nesting violates the task hierarchy. */
  | "hierarchy"
  /** The data changed since the client read it. */
  | "stale"
  /** The requested dates or operation are not valid for this item. */
  | "invalid"
  /** The task, project, dependency or change set no longer exists. */
  | "not-found"
  /** The change set is no longer in a state that can be undone or redone. */
  | "unavailable"
  /** A later edit blocks undo or redo. */
  | "blocked";

export class ScheduleError extends Error {
  constructor(
    readonly code: ScheduleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ScheduleError";
  }
}

export type ScheduleFailure = { ok: false; code: ScheduleErrorCode };

/** Converts an expected scheduling failure into a result; rethrows anything else. */
export function scheduleFailure(error: unknown): ScheduleFailure {
  if (error instanceof ScheduleError) return { ok: false, code: error.code };
  throw error;
}
