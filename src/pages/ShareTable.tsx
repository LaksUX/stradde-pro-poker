import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { toChips, type ChipRatio } from '../lib/chips'

type GameSummary = {
  id: string
  name: string
  venue_freetext: string | null
  scheduled_for: string
  status: 'scheduled' | 'live' | 'closed'
  stake: number
  table_size: number
  table_status_override: 'full' | 'open' | null
}
type RosterRow = { profile_id: string; full_name: string; buyin_count: number }

// See PAGE_PROMPTS.md "Share Table / RSVP link" — one link, four states,
// public and unauthenticated. This is the screen where Supabase Realtime
// actually earns its place: the seat count and ranked list need to update
// live as people join and buy in, without polling.
export function ShareTable() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const displayMode = searchParams.get('display') === '1'
  const [game, setGame] = useState<GameSummary | null>(null)
  const [roster, setRoster] = useState<RosterRow[]>([])

  useEffect(() => {
    if (!gameId) return

    async function loadGame() {
      const { data } = await supabase
        .from('public_game_summary')
        .select('*')
        .eq('id', gameId)
        .maybeSingle()
      setGame(data as GameSummary | null)
    }
    async function loadRoster() {
      const { data } = await supabase
        .from('public_live_roster')
        .select('*')
        .eq('game_id', gameId)
        .order('buyin_count', { ascending: false })
      setRoster((data ?? []) as RosterRow[])
    }
    loadGame()
    loadRoster()

    // Realtime: re-fetch on any change to this game's row or its buy-in
    // requests. Re-querying the views on each event is simple and correct;
    // for a busier table you'd want more targeted incremental updates, but
    // that's an optimization to make once this is proven correct, not before.
    const channel = supabase
      .channel(`share-table-${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        loadGame
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'buyin_requests', filter: `game_id=eq.${gameId}` },
        loadRoster
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
        loadRoster
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId])

  if (!game) return <div className="p-6 text-center text-muted">Loading…</div>

  if (game.status === 'scheduled') {
    return (
      <div className="mx-auto max-w-sm p-6 text-center">
        <h1 className="text-lg font-semibold text-ink">{game.name}</h1>
        <p className="mt-2 text-muted">
          Starts {new Date(game.scheduled_for).toLocaleString()} — hasn't started yet.
        </p>
      </div>
    )
  }
  if (game.status === 'closed') {
    return (
      <div className="mx-auto max-w-sm p-6 text-center text-muted">
        This game has ended. Settlement details go to whoever was in it — see My Settlements
        (not built in this pass — see PAGE_PROMPTS.md).
      </div>
    )
  }

  const seated = roster.length
  const full = game.table_status_override
    ? game.table_status_override === 'full'
    : seated >= game.table_size
  const ratio: ChipRatio = '1:1' // not exposed pre-join — see Join.tsx's comment

  return (
    <div className="mx-auto max-w-sm p-6">
      {displayMode && (
        <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-muted">
          Table display
        </p>
      )}
      <div className="mx-auto mb-4 h-32 w-32 rounded-sm border-4 border-canvas bg-[repeating-conic-gradient(#222_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] shadow-elevated" />
      <div className="rounded-md border border-hairline p-4">
        <h1 className="text-lg font-semibold text-ink">{game.name}</h1>
        <p className="text-sm text-muted">{game.venue_freetext}</p>
        <p className="text-sm text-muted">
          {game.stake} banks buy-in ({toChips(game.stake, ratio)} chips)
        </p>
        <span
          className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            full ? 'bg-red-50 text-error' : 'bg-green-50 text-win'
          }`}
        >
          {full ? 'Table full' : 'Seats open'} · {seated}/{game.table_size}
        </span>
      </div>

      {!displayMode && (
        <>
          <button
            onClick={() => navigate(`/join/${gameId}`)}
            className="mt-4 h-12 w-full rounded-sm bg-primary text-[16px] font-medium text-on-primary hover:bg-primary-active"
          >
            {full ? 'Request a seat anyway' : 'Join this game'}
          </button>
          <button
            onClick={() => navigate(`/t/${gameId}?display=1`, { replace: true })}
            className="mt-2 w-full text-center text-xs text-muted underline"
          >
            Put this device on table display
          </button>
        </>
      )}

      {roster.length > 0 && (
        <div className="mt-5 rounded-md border border-hairline">
          <p className="border-b border-hairline-soft p-3 text-center text-xs text-muted">
            Names only, ranked by buy-ins — no totals, no one else's numbers.
          </p>
          {roster.map((r) => (
            <div
              key={r.profile_id}
              className="flex items-center justify-between border-b border-hairline-soft px-3 py-2.5 text-sm last:border-none"
            >
              <span className="font-semibold text-ink">{r.full_name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
