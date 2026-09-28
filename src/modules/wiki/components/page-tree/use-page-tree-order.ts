"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import { toast } from "sonner";
import type { WorkspacePage } from "../../research-queries";
import { reorderPages } from "../../actions";
import type { PageStatus } from "./page-tree-types";

/** Optimistic page list for drag reordering and status changes, resynced from the server. */
export function usePageTreeOrder(pages: WorkspacePage[]) {
  const t = useTranslations("wiki");
  const router = useRouter();
  const [order, setOrder] = useState<WorkspacePage[]>(pages);
  // Optimistic order is local state, so a refreshed server list has to replace it;
  // without this the list keeps showing the pre-refresh order.
  const [syncedPages, setSyncedPages] = useState(pages);
  if (pages !== syncedPages) {
    setSyncedPages(pages);
    setOrder(pages);
  }

  function patchStatus(ids: readonly string[], status: PageStatus) {
    const changed = new Set(ids);
    const previous = order;
    setOrder((current) => current.map((page) => (changed.has(page.id) ? { ...page, status } : page)));
    return () => setOrder(previous);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const moved = order.find((page) => page.id === active.id);
    const target = order.find((page) => page.id === over.id);
    if (!moved || !target) return;
    // Dragging only rearranges siblings; "Move…" in the row menu changes the parent.
    if ((moved.parentId ?? null) !== (target.parentId ?? null)) {
      toast.error(t("reorderSameLevelOnly"));
      return;
    }
    const siblings = order
      .filter((page) => (page.parentId ?? null) === (moved.parentId ?? null))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
    const from = siblings.findIndex((page) => page.id === moved.id);
    const to = siblings.findIndex((page) => page.id === target.id);
    if (from < 0 || to < 0) return;
    const orderedIds = arrayMove(siblings, from, to).map((page) => page.id);

    const previous = order;
    const position = new Map(orderedIds.map((id, index) => [id, index]));
    setOrder((pagesInState) =>
      pagesInState.map((page) => (position.has(page.id) ? { ...page, sortOrder: position.get(page.id)! } : page)),
    );
    try {
      await reorderPages({ parentId: moved.parentId ?? null, orderedIds });
      router.refresh();
    } catch (error) {
      setOrder(previous);
      toast.error(error instanceof Error ? error.message : t("reorderFailed"));
    }
  }

  return { order, patchStatus, handleDragEnd };
}
