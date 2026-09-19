import { useEffect, useState } from 'react'
import { resolveConfirm, subscribeConfirm, type ConfirmRequest } from '../../lib/confirmDialog'
import { Button } from './Button'

// Mounted once at the app root (see App.tsx) — a promise-based confirm()
// replacement so any async handler can `await confirmDialog(...)` and get a
// real modal (with the app's 50%-black scrim, per DESIGN-mercury.md) instead
// of the browser's native, unstyleable confirm() dialog.
export function ConfirmDialogHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)

  useEffect(() => subscribeConfirm(setRequest), [])

  if (!request) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div
        role="alertdialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-t-xl border border-hairline bg-canvas p-5 shadow-elevated sm:rounded-xl [padding-bottom:env(safe-area-inset-bottom)]"
      >
        <p className="text-[15px] leading-relaxed text-ink">{request.message}</p>
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" block onClick={() => resolveConfirm(false)}>
            {request.cancelLabel}
          </Button>
          <Button
            variant={request.danger ? 'danger' : 'primary'}
            block
            onClick={() => resolveConfirm(true)}
          >
            {request.confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
