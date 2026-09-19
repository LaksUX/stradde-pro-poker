// A dependency-free toast store: a plain module-level pub/sub so both React
// components (via subscribeToasts) and non-component code (runWrite in
// errors.ts, which can't call hooks) can trigger a toast the same way.
export type ToastKind = 'success' | 'error' | 'info'
export type ToastItem = { id: number; kind: ToastKind; message: string }
type Listener = (toasts: ToastItem[]) => void

let toasts: ToastItem[] = []
let listeners: Listener[] = []
let nextId = 1

function emit() {
  for (const listener of listeners) listener(toasts)
}

function push(kind: ToastKind, message: string) {
  const id = nextId++
  toasts = [...toasts, { id, kind, message }]
  emit()
  setTimeout(() => dismissToast(id), kind === 'error' ? 5000 : 3000)
}

export function dismissToast(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.push(listener)
  listener(toasts)
  return () => {
    listeners = listeners.filter((l) => l !== listener)
  }
}

export const toast = {
  success: (message: string) => push('success', message),
  error: (message: string) => push('error', message),
  info: (message: string) => push('info', message),
}
