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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type TextPromptOptions = {
  /** Dialog heading; also the accessible name of the dialog. */
  title: string
  description?: string
  /** Visible field label. Falls back to the title for the input's accessible name. */
  label?: string
  defaultValue?: string
  placeholder?: string
  /** Blocks submitting an empty (whitespace-only) value. */
  required?: boolean
  confirmLabel?: string
  maxLength?: number
}

type TextPromptDialogProps = TextPromptOptions & {
  open: boolean
  /** Called with the trimmed value on submit, or null when cancelled. */
  onResolve: (value: string | null) => void
}

/**
 * Accessible, styleable replacement for window.prompt: a labelled text field in a
 * modal dialog. Enter submits, Escape or "Cancel" dismisses.
 */
export function TextPromptDialog({
  open,
  onResolve,
  title,
  description,
  label,
  defaultValue = "",
  placeholder,
  required = false,
  confirmLabel,
  maxLength,
}: TextPromptDialogProps) {
  const t = useTranslations("common")
  const inputId = React.useId()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [value, setValue] = React.useState(defaultValue)
  const [wasOpen, setWasOpen] = React.useState(open)
  // Start every prompt from its default instead of the previous prompt's text.
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setValue(defaultValue)
  }
  const blocked = required && !value.trim()

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onResolve(null) }}>
      <DialogContent initialFocus={inputRef} data-testid="text-prompt-dialog">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!blocked) onResolve(value.trim())
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="grid gap-2">
            {label && <Label htmlFor={inputId}>{label}</Label>}
            <Input
              ref={inputRef}
              id={inputId}
              aria-label={label ? undefined : title}
              value={value}
              placeholder={placeholder}
              maxLength={maxLength}
              required={required}
              autoComplete="off"
              onChange={(event) => setValue(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onResolve(null)}>{t("cancel")}</Button>
            <Button type="submit" disabled={blocked}>{confirmLabel ?? t("confirm")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Promise-based prompt: render the returned element once, then
 * `const value = await ask({ title })` resolves to the trimmed text or null.
 */
export function useTextPrompt(): [React.ReactNode, (options: TextPromptOptions) => Promise<string | null>] {
  const [open, setOpen] = React.useState(false)
  // Kept after closing so the exit animation still shows the prompt's text.
  const [options, setOptions] = React.useState<TextPromptOptions>({ title: "" })
  const resolver = React.useRef<((value: string | null) => void) | null>(null)

  const ask = React.useCallback((next: TextPromptOptions) => new Promise<string | null>((resolve) => {
    resolver.current?.(null)
    resolver.current = resolve
    setOptions(next)
    setOpen(true)
  }), [])

  const resolve = React.useCallback((value: string | null) => {
    const current = resolver.current
    resolver.current = null
    setOpen(false)
    current?.(value)
  }, [])

  React.useEffect(() => () => { resolver.current?.(null) }, [])

  return [<TextPromptDialog key="text-prompt" {...options} open={open} onResolve={resolve} />, ask]
}
