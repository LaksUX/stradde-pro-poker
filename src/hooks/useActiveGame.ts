import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from './useAuth'

export type ActiveGame = { gameId: string; isHost: boolean }

// Backs the bottom nav's "Live" tab (PAGE_PROMPTS.md's Global section:
// "Bottom nav: Home + Live (when a game's active) only"). A host is now
// always a game_players row in their own game too (see CreateGame.tsx), so
// one query against game_players — embedding games' status — covers both
// "I'm hosting a live game" and "I'm playing in one" without needing two
// separate lookups or separate RLS paths.
export function useActiveGame(profile: Profile | null): ActiveGame | null {
  const [active, setActive] = useState<ActiveGame | null>(null)

  useEffect(() => {
    if (!profile) {
      setActive(null)
      return
    }
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('game_players')
        .select('game_id, is_host, games(status)')
        .eq('profile_id', profile!.id)
      if (cancelled) return
      const live = (data ?? []).find((row: any) => row.games?.status === 'live')
      setActive(live ? { gameId: live.game_id, isHost: live.is_host } : null)
    }
    load()

    const channel = supabase
      .channel(`active-game-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games' },
        load
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players', filter: `profile_id=eq.${profile.id}` },
        load
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [profile?.id])

  return active
}
