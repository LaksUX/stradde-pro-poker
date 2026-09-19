import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { toChips, type ChipRatio } from '../lib/chips'
import { PageSpinner } from '../components/ui/Spinner'

type Game = {
  id: string
  name: string
  host_id: string
  status: 'scheduled' | 'live' | 'closed'
  stake: number
  chip_ratio: ChipRatio
  rake: number
  venue_id: string | null
  venue_freetext: string | null
  closed_at: string | null
}
type PlayerRow = { id: string; profile_id: string; full_name: string; cashout: number | null; buyins: number }

// See PAGE_PROMPTS.md "Game Detail". The host/player visibility rule
// enforced client-side here mirrors what RLS already enforces at the
// database layer for game_players — a non-host querying this only ever
// gets their own row back regardless of what this component asks for, so
// the role check below is a UI convenience, not the actual security
// boundary (RLS is).
export function GameDetail() {
  const { gameId } = useParams()
  const { profile } = useAuth()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [transfers, setTransfers] = useState<
    { from: string; to: string; amount: number; status: string }[]
  >([])

  useEffect(() => {
    if (!gameId || !profile) return
    async function load() {
      const { data: g } = await supabase.from('games').select('*').eq('id', gameId).single()
      setGame(g as Game)

      const { data: rows } = await supabase
        .from('game_players')
        .select('id, profile_id, cashout, profiles(full_name)')
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
          full_name: row.profiles?.full_name ?? '—',
          cashout: row.cashout,
          buyins: counts.get(row.id) ?? 0,
        }))
      )

      if (g?.host_id === profile?.id) {
        const { data: ts } = await supabase
          .from('settlement_transfers')
          .select('from_player_id, to_player_id, amount, status')
          .eq('game_id', gameId)
        const byId = new Map((rows ?? []).map((r: any) => [r.id, r.profiles?.full_name ?? '—']))
        setTransfers(
          (ts ?? []).map((t) => ({
            from: byId.get(t.from_player_id) ?? '—',
            to: byId.get(t.to_player_id) ?? '—',
            amount: t.amount,
            status: t.status,
          }))
        )
      }
    }
    load()
  }, [gameId, profile])

  if (!game || !profile) return <PageSpinner />
  const ratio = game.chip_ratio
  const isHost = game.host_id === profile.id
  const me = players.find((p) => p.profile_id === profile.id)

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="text-lg font-semibold text-ink">{game.name}</h1>
      {game.venue_id ? (
        <Link to={`/venues/${game.venue_id}`} className="text-sm text-primary underline">
          {game.venue_freetext}
        </Link>
      ) : (
        <p className="text-sm text-muted">{game.venue_freetext}</p>
      )}

      {isHost ? (
        <>
          <div className="mt-4 rounded-md border border-hairline">
            {players.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between border-b border-hairline-soft p-3 text-sm last:border-none"
              >
                <span className="text-ink">{p.full_name}</span>
                <span className="text-muted">
                  {p.buyins} buy-ins ·{' '}
                  {p.cashout == null ? (
                    'in play'
                  ) : (
                    <span className={p.cashout - p.buyins * game.stake >= 0 ? 'text-win' : 'text-error'}>
                      {toChips(p.cashout - p.buyins * game.stake, ratio)} chips
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
          {transfers.length > 0 && (
            <div className="mt-4 rounded-md border border-hairline p-3">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                Settlement
              </h2>
              {transfers.map((t, i) => (
                <div key={i} className="flex items-center justify-between py-1 text-sm">
                  <span className="text-ink">
                    {t.from} → {t.to}
                  </span>
                  <span className="text-muted">
                    {toChips(t.amount, ratio)} chips · {t.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : me ? (
        <div className="mt-4 rounded-md border border-hairline p-4 text-center">
          <p className="text-sm text-muted">Your buy-ins</p>
          <p className="text-lg font-bold tabular-nums text-ink">{me.buyins}</p>
          <p className="mt-3 text-sm text-muted">Your net</p>
          <p
            className={`text-2xl font-bold tabular-nums ${
              me.cashout != null && me.cashout - me.buyins * game.stake >= 0 ? 'text-win' : 'text-error'
            }`}
          >
            {me.cashout == null ? 'In play' : `${toChips(me.cashout - me.buyins * game.stake, ratio)} chips`}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-center text-sm text-muted">You weren't in this game.</p>
      )}
    </div>
  )
}
