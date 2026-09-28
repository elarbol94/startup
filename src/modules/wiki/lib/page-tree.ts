type TreeInput = { id: string; parentId: string | null; sortOrder: number; createdAt: number };

/**
 * Flattens pages into display order, depth-first, siblings by sortOrder then createdAt.
 * Pages whose parent is missing from the input (deleted, or filtered out) are kept as roots
 * rather than dropped, so no page can disappear from the list.
 */
export function buildPageTree<T extends TreeInput>(pages: T[]): Array<T & { depth: number }> {
  const byParent = new Map<string | null, T[]>();
  const known = new Set(pages.map((page) => page.id));
  for (const page of pages) {
    const parentId = page.parentId && known.has(page.parentId) ? page.parentId : null;
    const siblings = byParent.get(parentId) ?? [];
    siblings.push(page);
    byParent.set(parentId, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
  }
  const rows: Array<T & { depth: number }> = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const page of byParent.get(parentId) ?? []) {
      rows.push({ ...page, depth });
      walk(page.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

type ParentLink = { id: string; parentId: string | null };

function childrenByParent(pages: readonly ParentLink[]) {
  const children = new Map<string, string[]>();
  for (const page of pages) {
    if (!page.parentId) continue;
    const list = children.get(page.parentId) ?? [];
    list.push(page.id);
    children.set(page.parentId, list);
  }
  return children;
}

/** The given pages plus every page below them. */
export function descendantIds(pages: readonly ParentLink[], rootIds: Iterable<string>): Set<string> {
  const children = childrenByParent(pages);
  const found = new Set<string>();
  const queue = [...rootIds];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (found.has(id)) continue;
    found.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return found;
}

/**
 * Drops selected pages that sit below another selected page: cascading actions
 * (trash, move) already carry them along with their ancestor.
 */
export function topmostSelected(pages: readonly ParentLink[], ids: Iterable<string>): string[] {
  const selected = new Set(ids);
  const parentOf = new Map(pages.map((page) => [page.id, page.parentId]));
  return [...selected].filter((id) => {
    const seen = new Set([id]);
    let parent = parentOf.get(id) ?? null;
    while (parent && !seen.has(parent)) {
      if (selected.has(parent)) return false;
      seen.add(parent);
      parent = parentOf.get(parent) ?? null;
    }
    return true;
  });
}

/** Ancestors of a page, root first, excluding the page itself. */
export function ancestorPath<T extends ParentLink>(pages: readonly T[], id: string): T[] {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const path: T[] = [];
  const seen = new Set([id]);
  let parent = byId.get(id)?.parentId ?? null;
  while (parent && !seen.has(parent) && byId.has(parent)) {
    seen.add(parent);
    path.unshift(byId.get(parent)!);
    parent = byId.get(parent)!.parentId;
  }
  return path;
}
