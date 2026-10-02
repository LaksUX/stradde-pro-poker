import { useEffect, useState } from 'react'
import { resolveConfirm, subscribeConfirm, type ConfirmRequest } from '../../lib/confirmDialog'
import { Button } from './button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
} from './alert-dialog'

// Mounted once at the app root (see App.tsx) — a promise-based confirm()
// replacement so any async handler can `await confirmDialog(...)` and get a
// real modal instead of the browser's native confirm().
export function ConfirmDialogHost() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)

  useEffect(() => subscribeConfirm(setRequest), [])

  if (!request) return null

  return (
    <AlertDialog open onOpenChange={(open) => !open && resolveConfirm(false)}>
      <AlertDialogContent>
        <AlertDialogDescription>{request.message}</AlertDialogDescription>
        <AlertDialogFooter>
          <Button variant="ghost" block onClick={() => resolveConfirm(false)}>
            {request.cancelLabel}
          </Button>
          <Button
            variant={request.danger ? 'destructive' : 'default'}
            block
            onClick={() => resolveConfirm(true)}
          >
            {request.confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
