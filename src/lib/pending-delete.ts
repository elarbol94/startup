/**
 * Delayed-delete queue: an entry hides some ids right away and runs its
 * `commit` only after `delayMs` unless it is cancelled (Undo) first.
 * Framework-free so the scheduling can be unit tested with injected timers.
 */

export type PendingDeleteCommit = () => Promise<void | string>;

export type PendingDeleteEntry = {
  hiddenIds: string[];
  commit: PendingDeleteCommit;
  onCommitted?: () => void;
  /** Called with the error message (if any) when the commit fails. */
  onError?: (message: string | undefined) => void;
};

type Timers = {
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
};

export const PENDING_DELETE_DELAY_MS = 10_000;

export function createPendingDeleteQueue({
  delayMs = PENDING_DELETE_DELAY_MS,
  timers = {
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
}: { delayMs?: number; timers?: Timers } = {}) {
  let nextKey = 0;
  const entries = new Map<number, PendingDeleteEntry & { timer: unknown }>();
  const listeners = new Set<() => void>();
  let hidden: ReadonlySet<string> = new Set();

  function emit() {
    hidden = new Set([...entries.values()].flatMap((entry) => entry.hiddenIds));
    for (const listener of listeners) listener();
  }

  async function run(key: number) {
    const entry = entries.get(key);
    if (!entry) return;
    timers.clearTimer(entry.timer);
    // Keep the ids hidden while the server call runs; un-hide on failure.
    let failure: { message: string | undefined } | null = null;
    try {
      const result = await entry.commit();
      if (typeof result === "string") failure = { message: result };
    } catch {
      failure = { message: undefined };
    }
    entries.delete(key);
    emit();
    if (failure) entry.onError?.(failure.message);
    else entry.onCommitted?.();
  }

  return {
    /** Hides the ids now and commits after the delay. Returns the entry key. */
    schedule(entry: PendingDeleteEntry): number {
      const key = nextKey++;
      const timer = timers.setTimer(() => void run(key), delayMs);
      entries.set(key, { ...entry, timer });
      emit();
      return key;
    },
    /** Undo: drops the entry without committing. Returns false if too late. */
    cancel(key: number): boolean {
      const entry = entries.get(key);
      if (!entry) return false;
      timers.clearTimer(entry.timer);
      entries.delete(key);
      emit();
      return true;
    },
    /** Commits every still-pending entry immediately. */
    flush(): Promise<void[]> {
      return Promise.all([...entries.keys()].map((key) => run(key)));
    },
    hiddenIds(): ReadonlySet<string> {
      return hidden;
    },
    size(): number {
      return entries.size;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type PendingDeleteQueue = ReturnType<typeof createPendingDeleteQueue>;
