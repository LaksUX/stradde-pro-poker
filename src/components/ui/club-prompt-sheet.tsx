import { useEffect, useState } from 'react'
import { Button } from './button'
import { Input } from './input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './sheet'

// One-field bottom sheet for the club screens: a chip count or a reason.
export function ClubPromptSheet({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  numeric,
  submitLabel,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: string
  description?: React.ReactNode
  placeholder: string
  numeric?: boolean
  submitLabel: string
  onSubmit: (value: string) => Promise<void>
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setValue('')
  }, [open])

  async function go() {
    setBusy(true)
    try {
      await onSubmit(value)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <Input
          className="mt-4 h-12"
          autoFocus
          inputMode={numeric ? 'numeric' : undefined}
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button block className="mt-4" disabled={busy || !value.trim()} onClick={go}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </SheetContent>
    </Sheet>
  )
}
