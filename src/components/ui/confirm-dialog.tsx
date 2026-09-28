"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type ConfirmOptions = {
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  /** Red confirm button; focus starts on Cancel so Enter does not destroy anything. */
  destructive?: boolean
}

type ConfirmDialogProps = ConfirmOptions & {
  open: boolean
  onResolve: (confirmed: boolean) => void
}

/** Accessible, styleable replacement for window.confirm. */
export function ConfirmDialog({ open, onResolve, title, description, confirmLabel, destructive = false }: ConfirmDialogProps) {
  const t = useTranslations("common")
  const cancelRef = React.useRef<HTMLButtonElement>(null)
  const confirmRef = React.useRef<HTMLButtonElement>(null)
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onResolve(false) }}>
      <DialogContent role="alertdialog" initialFocus={destructive ? cancelRef : confirmRef} data-testid="confirm-dialog" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button ref={cancelRef} type="button" variant="outline" onClick={() => onResolve(false)}>{t("cancel")}</Button>
          <Button ref={confirmRef} type="button" variant={destructive ? "destructive" : "default"} onClick={() => onResolve(true)}>{confirmLabel ?? t("confirm")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Promise-based confirm: render the returned element once, then
 * `if (await confirm({ title })) …`. Dismissing resolves to false.
 */
export function useConfirm(): [React.ReactNode, (options: ConfirmOptions) => Promise<boolean>] {
  const [open, setOpen] = React.useState(false)
  // Kept after closing so the exit animation still shows the text.
  const [options, setOptions] = React.useState<ConfirmOptions>({ title: "" })
  const resolver = React.useRef<((value: boolean) => void) | null>(null)

  const confirm = React.useCallback((next: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current?.(false)
    resolver.current = resolve
    setOptions(next)
    setOpen(true)
  }), [])

  const resolve = React.useCallback((value: boolean) => {
    const current = resolver.current
    resolver.current = null
    setOpen(false)
    current?.(value)
  }, [])

  React.useEffect(() => () => { resolver.current?.(false) }, [])

  return [<ConfirmDialog key="confirm" {...options} open={open} onResolve={resolve} />, confirm]
}
