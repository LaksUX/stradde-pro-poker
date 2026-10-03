import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'

export function useIsGameHost(gameId: string | undefined, hostId: string | undefined) {
  const { profile } = useAuth()
  const [isHost, setIsHost] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!gameId || !profile) {
      setIsHost(false)
      setLoading(false)
      return
    }

    // The game row hasn't loaded yet, so there's nothing to compare against.
    // Staying in "loading" (instead of concluding "not a host") stops the
    // page redirecting a real host to the player view before the game arrives.
    if (hostId === undefined) {
      setLoading(true)
      return
    }

    if (hostId === profile.id) {
      setIsHost(true)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    async function check() {
      const { data } = await supabase
        .from('game_managers')
        .select('id')
        .eq('game_id', gameId!)
        .eq('profile_id', profile!.id)
        .maybeSingle()
      if (!cancelled) {
        setIsHost(!!data)
        setLoading(false)
      }
    }
    check()
    return () => { cancelled = true }
  }, [gameId, hostId, profile])

  return { isHost, loading }
}
