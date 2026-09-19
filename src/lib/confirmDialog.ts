// Same pub/sub shape as toast.ts — a promise-based confirm() replacement
// callable from plain async functions (e.g. LiveGame's closeAndSettle),
// not just from inside a component.
export type ConfirmOptions = {
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}
export type ConfirmRequest = {
  id: number
  message: string
  confirmLabel: string
  cancelLabel: string
  danger: boolean
}
type Listener = (request: ConfirmRequest | null) => void

let current: (ConfirmRequest & { resolve: (ok: boolean) => void }) | null = null
let listeners: Listener[] = []
let nextId = 1

function emit() {
  for (const listener of listeners) listener(current)
}

export function confirmDialog(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    current = {
      id: nextId++,
      message,
      confirmLabel: opts.confirmLabel ?? 'Confirm',
      cancelLabel: opts.cancelLabel ?? 'Cancel',
      danger: opts.danger ?? false,
      resolve,
    }
    emit()
  })
}

export function resolveConfirm(ok: boolean) {
  if (!current) return
  current.resolve(ok)
  current = null
  emit()
}

export function subscribeConfirm(listener: Listener): () => void {
  listeners.push(listener)
  listener(current)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}
