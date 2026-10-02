import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { Alert, AlertDescription } from './alert'

// Rendered once, app-wide (App.tsx) — a persistent strip rather than a toast,
// since it must still be visible if the person looks back a minute later.
export function OfflineBanner() {
  const online = useOnlineStatus()
  if (online) return null

  return (
    <Alert
      variant="destructive"
      className="fixed inset-x-0 top-0 z-50 rounded-none [padding-top:calc(env(safe-area-inset-top)+0.5rem)]"
    >
      <AlertDescription>
        No connection — buy-ins, cash-outs, and other changes won't save until you're back online.
      </AlertDescription>
    </Alert>
  )
}
