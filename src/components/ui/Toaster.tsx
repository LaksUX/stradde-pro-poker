import { useEffect, useState } from 'react'
import { dismissToast, subscribeToasts, type ToastItem, type ToastKind } from '../../lib/toast'

const dotClass: Record<ToastKind, string> = {
  success: 'bg-win',
  error: 'bg-error',
  info: 'bg-primary',
}

// Mounted once at the app root (see App.tsx). Renders above the bottom nav
// so it's visible on every authenticated screen without each page needing
// to know it exists.
export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => subscribeToasts(setToasts), [])

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 [padding-bottom:env(safe-area-inset-bottom)]">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="animate-[toast-in_0.15s_ease-out] pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-md border border-hairline bg-canvas p-3 text-sm text-ink shadow-elevated"
        >
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass[t.kind]}`} />
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss"
            className="-m-1 rounded-full p-1 text-muted hover:bg-surface-soft hover:text-ink"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}
