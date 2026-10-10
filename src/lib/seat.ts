import { supabase } from './supabase'

// Everyone sits down with at least one bank. When a host adds a player to a
// live game, record their first buy-in straight away (a normal confirmed,
// host-entered buy-in, so it can be lowered or corrected like any other).
// Safe to call twice: it does nothing if the player already has a buy-in.
// The host's own row is skipped, since a host may be running the game without
// playing.
export async function giveStartingBuyin(gameId: string, profileId: string, name: string): Promise<void> {
  try {
    const { data: g } = await supabase.from('games').select('status').eq('id', gameId).maybeSingle()
    if (g?.status !== 'live') return
    const { data: gp } = await supabase
      .from('game_players')
      .select('id, is_host')
      .eq('game_id', gameId)
      .eq('profile_id', profileId)
      .maybeSingle()
    if (!gp || gp.is_host) return
    const { count } = await supabase
      .from('buyin_requests')
      .select('id', { count: 'exact', head: true })
      .eq('game_player_id', gp.id)
      .eq('status', 'confirmed')
    if ((count ?? 0) > 0) return
    await supabase.from('buyin_requests').insert({
      game_id: gameId,
      profile_id: profileId,
      requester_name: name,
      game_player_id: gp.id,
      request_type: 'more_buyins',
      count: 1,
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      is_direct_add: true,
    })
  } catch {
    // Best effort: the host can still add the buy-in by hand.
  }
}
