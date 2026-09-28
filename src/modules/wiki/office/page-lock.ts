/**
 * Serialises the short critical sections of office operations per page:
 * callback processing, session opening and the start/finish steps of
 * long operations. Never wait for a callback or a document-server reply while
 * holding it. The app runs as a single Node process (docs/office-documents.md);
 * transactions still re-check state as a backstop.
 */
const globalForLocks = globalThis as unknown as { officePageLocks?: Map<string, Promise<unknown>> };
const locks = globalForLocks.officePageLocks ??= new Map();

export function withPageOfficeLock<T>(pageId: string, fn: () => Promise<T> | T): Promise<T> {
  const previous = locks.get(pageId) ?? Promise.resolve();
  const run = previous.then(() => fn(), () => fn());
  const tail = run.then(() => undefined, () => undefined);
  locks.set(pageId, tail);
  void tail.then(() => { if (locks.get(pageId) === tail) locks.delete(pageId); });
  return run;
}

/**
 * Holds the lock of every page in `pageIds` (e.g. a whole subtree) while `fn`
 * runs. Locks are taken in sorted order so two callers never deadlock.
 */
export function withPageOfficeLocks<T>(pageIds: Iterable<string>, fn: () => Promise<T> | T): Promise<T> {
  const ordered = [...new Set(pageIds)].sort();
  const take = (index: number): Promise<T> => index >= ordered.length
    ? Promise.resolve().then(fn)
    : withPageOfficeLock(ordered[index], () => take(index + 1));
  return take(0);
}
