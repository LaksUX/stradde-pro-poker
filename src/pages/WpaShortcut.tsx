import { Navigate } from 'react-router-dom'
import { lastCardToken } from '../lib/playerCard'

// Short address a player can type to get back to their card on this phone.
export function WpaShortcut() {
  const token = lastCardToken()
  if (token) return <Navigate to={`/c/${token}`} replace />
  return (
    <div className="mx-auto w-full max-w-md p-6 text-center">
      <h1 className="text-xl font-bold text-ink">No card on this phone yet</h1>
      <p className="mt-2 text-sm text-muted">
        Open the link your host sent you once. After that, this shortcut brings you straight back to your card.
      </p>
    </div>
  )
}
