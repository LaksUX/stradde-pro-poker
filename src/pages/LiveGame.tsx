import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { toChips, type ChipRatio } from '../lib/chips'
import { Button } from '../components/ui/Button'

type Game = {
  id: string
  name: string
  stake: number
  chip_ratio: ChipRatio
  rake: number
  table_size: number
  table_status_override: 'full' | 'open' | null
}
type PendingRequest = {
  id: string
  requester_name: string
  request_type: 'join' | 'more_buyins'
  count: number
  requested_at: string
}
type PlayerRow = {
  id: string
  profile_id: string
  is_host: boolean
  cashout: number | null
  full_name: string
  confirmed_buyins: number
}

// See PAGE_PROMPTS.md "Live Game". This pass wires the core loop that
// matters most to get right end to end: the Pending requests queue and
// confirm/decline — everything else on this screen (the full bottom sheet,
// rake reveal editing, cash-out keypad, Replace shortcut) follows the same
// query/mutation/realtime pattern and is the natural next slice to build.
export function LiveGame() {
  const { gameId } = useParams()
  const { profile } = useAuth()
  const [game, setGame] = useState<Game | null>(null)
  const [pending, setPending] = useState<PendingRequest[]>([])
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [rakeRevealed, setRakeRevealed] = useState(false)

  useEffect(() => {
    if (!gameId) return

    async function loadGame() {
      const { data } = await supabase.from('games').select('*').eq('id', gameId).single()
      setGame(data as Game)
    }
    async function loadPending() {
      const { data } = await supabase
        .from('buyin_requests')
        .select('id, requester_name, request_type, count, requested_at')
        .eq('game_id', gameId)
        .eq('status', 'pending')
        .order('requested_at', { ascending: true })
      setPending((data ?? []) as PendingRequest[])
    }
    async function loadPlayers() {
      // Two queries kept separate and joined client-side for clarity — a
      // single view (like public_live_roster, but host-scoped with cashout
      // included) is the natural next refactor once this is proven correct.
      const { data: rows } = await supabase
        .from('game_players')
        .select('id, profile_id, is_host, cashout, profiles(full_name)')
        .eq('game_id', gameId)
      const { data: reqs } = await supabase
        .from('buyin_requests')
        .select('game_player_id, count')
        .eq('game_id', gameId)
        .eq('status', 'confirmed')

      const counts = new Map<string, number>()
      for (const r of reqs ?? []) {
        if (!r.game_player_id) continue
        counts.set(r.game_player_id, (counts.get(r.game_player_id) ?? 0) + r.count)
      }
      setPlayers(
        (rows ?? []).map((row: any) => ({
          id: row.id,
          profile_id: row.profile_id,
          is_host: row.is_host,
          cashout: row.cashout,
          full_name: row.profiles?.full_name ?? '—',
          confirmed_buyins: counts.get(row.id) ?? 0,
        }))
      )
    }

    loadGame()
    loadPending()
    loadPlayers()

    const channel = supabase
      .channel(`live-game-${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'buyin_requests', filter: `game_id=eq.${gameId}` },
        () => {
          loadPending()
          loadPlayers()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
        loadPlayers
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId])

  async function confirmRequest(req: PendingRequest) {
    if (!gameId) return
    // Confirming a join request also needs a game_players row to exist.
    // Fetch the request's profile_id first (not selected above to keep the
    // pending list query light) — a Postgres function wrapping this in one
    // transaction is the right next step; this two-step client version is
    // fine for the "prove the pattern" scope of this pass.
    const { data: fullReq } = await supabase
      .from('buyin_requests')
      .select('profile_id, request_type')
      .eq('id', req.id)
      .single()
    if (!fullReq) return

    let gamePlayerId: string | null = null
    if (fullReq.request_type === 'join') {
      const { data: gp, error: gpError } = await supabase
        .from('game_players')
        .insert({ game_id: gameId, profile_id: fullReq.profile_id })
        .select('id')
        .single()
      if (gpError) {
        alert(gpError.message)
        return
      }
      gamePlayerId = gp.id
    } else {
      const { data: existing } = await supabase
        .from('game_players')
        .select('id')
        .eq('game_id', gameId)
        .eq('profile_id', fullReq.profile_id)
        .single()
      gamePlayerId = existing?.id ?? null
    }

    await supabase
      .from('buyin_requests')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), game_player_id: gamePlayerId })
      .eq('id', req.id)
  }

  async function declineRequest(id: string) {
    await supabase.from('buyin_requests').update({ status: 'declined' }).eq('id', id)
  }

  async function setCashout(playerId: string, value: number) {
    await supabase.from('game_players').update({ cashout: value }).eq('id', playerId)
  }

  async function setRake(value: number) {
    if (!gameId) return
    await supabase.from('games').update({ rake: value }).eq('id', gameId)
  }

  if (!game) return <div className="p-6 text-center text-muted">Loading…</div>
  if (!profile) return <div className="p-6 text-center text-muted">Sign in required.</div>

  const ratio = game.chip_ratio
  const activeSeated = players.filter((p) => p.cashout == null).length
  const full = game.table_status_override
    ? game.table_status_override === 'full'
    : activeSeated >= game.table_size

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-lg font-semibold text-ink">{game.name}</h1>

      <div className="mt-3 rounded-md border border-hairline p-3">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            full ? 'bg-red-50 text-error' : 'bg-green-50 text-win'
          }`}
        >
          {full ? 'Full' : 'Open'} · {activeSeated}/{game.table_size}
        </span>
      </div>

      <div className="mt-3 rounded-md border border-hairline p-3">
        <div className="flex items-center justify-between">
          <span className="text-muted">Rake</span>
          <button className="text-xs text-body underline" onClick={() => setRakeRevealed((v) => !v)}>
            {rakeRevealed ? 'Hide' : 'Reveal'}
          </button>
        </div>
        {rakeRevealed ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-lg font-bold text-ink">
              {toChips(game.rake, ratio)} chips
              <span className="ml-1 text-xs font-normal text-muted">({game.rake} banks)</span>
            </span>
            <input
              type="number"
              defaultValue={game.rake}
              onBlur={(e) => setRake(Number(e.target.value) || 0)}
              className="h-9 w-20 rounded-sm border border-hairline px-2 text-sm"
            />
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted">Masked — only you can see this.</p>
        )}
      </div>

      {pending.length > 0 && (
        <div className="mt-4 rounded-md border border-hairline p-3">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Pending requests ({pending.length})
          </h2>
          {pending.map((r) => (
            <div key={r.id} className="mb-2 flex items-center justify-between last:mb-0">
              <div>
                <div className="text-sm font-semibold text-ink">
                  {r.requester_name}
                  {r.request_type === 'more_buyins' ? ' — more buy-ins' : ''}
                </div>
                <div className="text-xs text-muted">
                  {r.count} buy-in{r.count > 1 ? 's' : ''}
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button variant="primary" className="h-8 px-3 text-xs" onClick={() => confirmRequest(r)}>
                  Confirm
                </Button>
                <Button variant="danger" className="h-8 px-3 text-xs" onClick={() => declineRequest(r.id)}>
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-md border border-hairline">
        {players.length === 0 && (
          <p className="p-4 text-center text-sm text-muted">
            No one has joined yet — share the link.
          </p>
        )}
        {players.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between border-b border-hairline-soft p-3 last:border-none"
          >
            <div>
              <div className="text-sm font-semibold text-ink">
                {p.full_name}
                {p.is_host ? ' (host)' : ''}
              </div>
              <div className="text-xs text-muted">
                {p.cashout == null
                  ? 'In play'
                  : `${toChips(p.cashout - p.confirmed_buyins * game.stake, ratio)} chips net`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-ink">{p.confirmed_buyins}</span>
              {p.cashout == null && (
                <button
                  className="text-xs text-muted underline"
                  onClick={() => {
                    const v = prompt('Cash out amount (banks)?')
                    if (v) setCashout(p.id, Number(v))
                  }}
                >
                  Cash out
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
