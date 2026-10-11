"use client"

import { useCallback } from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { useHorizontalOverflow } from "@/components/ui/use-horizontal-overflow"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex min-w-0 gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex max-w-full w-fit items-center justify-start overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-lg p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        // Design 1b underline tabs, matching SubNav: 40px, hairline below, brand bar on the active tab.
        line: "w-full gap-1 bg-transparent p-0 group-data-horizontal/tabs:h-10 group-data-horizontal/tabs:shadow-[inset_0_-1px_0_var(--border)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ref: forwardedRef,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  const { ref: overflowRef, overflowing } = useHorizontalOverflow()
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      overflowRef(element)
      if (typeof forwardedRef === "function") forwardedRef(element)
      else if (forwardedRef) forwardedRef.current = element
    },
    [overflowRef, forwardedRef]
  )

  return (
    <TabsPrimitive.List
      ref={ref}
      data-slot="tabs-list"
      data-variant={variant}
      data-overflowing={overflowing || undefined}
      className={cn(
        tabsListVariants({ variant }),
        "group-data-horizontal/tabs:data-overflowing:scroll-fade-x",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
        "group-data-[variant=line]/tabs-list:flex-none group-data-[variant=line]/tabs-list:rounded-md group-data-[variant=line]/tabs-list:px-3 group-data-[variant=line]/tabs-list:text-[13.5px] group-data-[variant=line]/tabs-list:text-muted-foreground group-data-[variant=line]/tabs-list:hover:text-foreground group-data-[variant=line]/tabs-list:data-active:text-foreground group-data-[variant=line]/tabs-list:focus-visible:ring-inset",
        "group-data-[variant=line]/tabs-list:after:rounded-full group-data-[variant=line]/tabs-list:after:bg-brand group-data-horizontal/tabs:group-data-[variant=line]/tabs-list:after:inset-x-3 group-data-horizontal/tabs:group-data-[variant=line]/tabs-list:after:bottom-0",
        "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("min-w-0 flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
