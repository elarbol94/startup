"use client"

import { useCallback, useEffect, useState } from "react"

/**
 * Tracks whether a horizontally scrollable element overflows, so the edge
 * fade (`scroll-fade-x`) only appears when there really are hidden items.
 */
export function useHorizontalOverflow() {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return
    const update = () => setOverflowing(node.scrollWidth > node.clientWidth + 1)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    for (const child of Array.from(node.children)) observer.observe(child)
    return () => observer.disconnect()
  }, [node])

  const ref = useCallback((element: HTMLElement | null) => setNode(element), [])
  return { ref, overflowing, node }
}
