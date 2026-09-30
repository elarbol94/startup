"use client";

import { useState } from "react";
import type { WorkspacePage } from "../../research-queries";
import { toggleFavorite } from "../../research-actions";
import { setPagesStatus } from "../../page-bulk-actions";
import type { PageStatus } from "../page-tree/page-tree-types";

/** Optimistic inbox state: status and favorite changes show before the server answers. */
export function useWorkspacePages(initialPages: WorkspacePage[]) {
  const [pages, setPages] = useState(initialPages);
  const [syncedPages, setSyncedPages] = useState(initialPages);
  if (initialPages !== syncedPages) {
    setSyncedPages(initialPages);
    setPages(initialPages);
  }
  const [pendingId, setPendingId] = useState<string | null>(null);

  function patchStatus(ids: readonly string[], status: PageStatus) {
    const changed = new Set(ids);
    const previous = pages;
    setPages((current) => current.map((page) => (changed.has(page.id) ? { ...page, status } : page)));
    return () => setPages(previous);
  }

  // Status only: the old full-metadata save re-sent tags from this (possibly stale)
  // list and could drop tags added elsewhere.
  async function changeStatus(page: WorkspacePage, status: PageStatus) {
    if (status === page.status) return;
    const undo = patchStatus([page.id], status);
    setPendingId(page.id);
    try {
      const outcome = await setPagesStatus({ ids: [page.id], status });
      if (outcome.skipped.length) undo();
    } catch {
      undo();
    } finally {
      setPendingId(null);
    }
  }

  async function changeFavorite(page: WorkspacePage) {
    const previous = pages;
    setPendingId(page.id);
    setPages((current) => current.map((item) => (item.id === page.id ? { ...item, favorite: !item.favorite } : item)));
    try {
      await toggleFavorite("page", page.id);
    } catch {
      setPages(previous);
    } finally {
      setPendingId(null);
    }
  }

  return { pages, pendingId, patchStatus, changeStatus, changeFavorite };
}
