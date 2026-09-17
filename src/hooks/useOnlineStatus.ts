import { useEffect, useState } from 'react'

// navigator.onLine only reflects the network interface being up, not
// whether Supabase is actually reachable — it can't catch "wifi connected,
// captive portal" or "server down." It's still worth surfacing: the common
// real-world case for a host at a table is airplane mode / no signal, which
// this catches correctly and cheaply, with no extra network calls of its
// own. See PAGE_PROMPTS.md's Global offline edge case.
export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}
