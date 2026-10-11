"use client"

// Underlined module sub-navigation (design 1b): sits under the PageHeader, scrolls sideways
// without a scrollbar, runs edge to edge on phones and keeps the active item in view.
//   <SubNav label={t("subnavLabel")}>
//     <SubNavLink href="/network" active icon={<UsersRound />}>{t("contactsTab")}</SubNavLink>
//   </SubNav>
// Use SubNavButton for in-page views (state instead of routes) and SubNavGroup to label groups.
import { useEffect, type ComponentProps, type ReactNode } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { useHorizontalOverflow } from "@/components/ui/use-horizontal-overflow"

export function SubNav({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  const { ref, overflowing, node } = useHorizontalOverflow()
  // Scroll the bar (never the page) so the current item stays visible when it changes.
  useEffect(() => {
    if (!node) return
    const reveal = () => {
      const item = node.querySelector<HTMLElement>('[aria-current="page"]')
      if (!item || node.scrollWidth <= node.clientWidth) return
      const itemLeft = item.getBoundingClientRect().left - node.getBoundingClientRect().left + node.scrollLeft
      node.scrollTo({ left: Math.max(0, itemLeft - (node.clientWidth - item.offsetWidth) / 2) })
    }
    reveal()
    const observer = new MutationObserver(reveal)
    observer.observe(node, { subtree: true, attributeFilter: ["aria-current"] })
    return () => observer.disconnect()
  }, [node])
  return (
    <nav
      ref={ref}
      data-slot="sub-nav"
      aria-label={label}
      data-overflowing={overflowing || undefined}
      className={cn(
        "flex shrink-0 items-stretch gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none] max-sm:-mx-4 max-sm:px-4 max-sm:scroll-px-4 [&::-webkit-scrollbar]:hidden",
        "data-overflowing:scroll-fade-x",
        className,
      )}
    >
      {children}
    </nav>
  )
}

/** Eyebrow-style label in front of a group of items; later groups get a divider. */
export function SubNavGroup({
  label,
  showLabel = true,
  divided = false,
  children,
}: {
  label: string
  showLabel?: boolean
  divided?: boolean
  children: ReactNode
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex shrink-0 items-stretch gap-1", divided && "ml-1.5 border-l pl-1.5")}>
      {showLabel ? (
        <span aria-hidden className="flex shrink-0 items-center pr-1.5 pl-3 text-[10.5px] font-semibold tracking-[0.14em] whitespace-nowrap text-text-tertiary uppercase">
          {label}
        </span>
      ) : null}
      {children}
    </div>
  )
}

export function subNavItemClass(active: boolean, className?: string) {
  return cn(
    "relative inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-[13.5px] font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&_svg]:size-4 [&_svg]:shrink-0",
    "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand after:opacity-0 after:transition-opacity",
    active ? "text-foreground after:opacity-100" : "text-muted-foreground hover:text-foreground",
    className,
  )
}

export function SubNavLink({
  active,
  icon,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { active: boolean; icon?: ReactNode }) {
  return (
    <Link aria-current={active ? "page" : undefined} className={subNavItemClass(active, className)} {...props}>
      {icon}
      {children}
    </Link>
  )
}

export function SubNavButton({
  active,
  icon,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { active: boolean; icon?: ReactNode }) {
  return (
    <button type="button" aria-current={active ? "page" : undefined} className={subNavItemClass(active, className)} {...props}>
      {icon}
      {children}
    </button>
  )
}
