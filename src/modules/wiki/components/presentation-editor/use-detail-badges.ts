"use client";
// Which elements show their detail page handle: the selection, and the one under the pointer.
// Used by presentation-editor.tsx.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useDetailBadges(selectedIds: string[]) {
  // The detail page handle shows on the element under the pointer (and on the selection). It
  // sits just outside the element, so leaving the element waits a moment for the pointer to
  // reach the handle instead of hiding it on the way.
  const [hoveredBadge, setHoveredBadge] = useState<string | null>(null);
  const badgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (badgeTimer.current) clearTimeout(badgeTimer.current); }, []);
  const hoverBadge = useCallback((id: string | null) => {
    if (badgeTimer.current) clearTimeout(badgeTimer.current);
    if (id) setHoveredBadge(id); else badgeTimer.current = setTimeout(() => setHoveredBadge(null), 350);
  }, []);
  const badgeIds = useMemo(() => new Set([...selectedIds, ...(hoveredBadge ? [hoveredBadge] : [])]), [selectedIds, hoveredBadge]);
  return { hoverBadge, badgeIds };
}
