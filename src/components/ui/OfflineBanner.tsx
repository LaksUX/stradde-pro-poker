import { useOnlineStatus } from '../../hooks/useOnlineStatus'

// Rendered once, app-wide (App.tsx) — a persistent, hard-to-miss strip
// rather than a toast, since it needs to still be visible if the person
// looks back at the screen a minute later, not just at the moment
// connection dropped. See PAGE_PROMPTS.md's Global offline edge case.
export function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-error px-3 py-2 text-center text-sm font-medium text-white [padding-top:calc(env(safe-area-inset-top)+0.5rem)]">
      No connection — buy-ins, cash-outs, and other changes won't save until you're back online.
    </div>
  )
}
