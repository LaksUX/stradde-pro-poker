import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { toChips, type ChipRatio } from '../lib/chips'
import { PageSpinner } from '../components/ui/Spinner'

type GameRow = {
  game_id: string
  host_id: string
  host_name: string
  game_name: string
  stake: number
  chip_ratio: ChipRatio
  rake: number
  closed_at: string
  confirmed_buyin_units: number
}
type Regular = { profile_id: string; full_name: string; games_played: number }
type MyRole =
  | { kind: 'hosted'; transfers: number; confirmedTransfers: number }
  | { kind: 'played'; buyins: number; net: number; settlementStatus: 'pending' | 'confirmed' | 'disputed' | null }
  | { kind: 'none' }

// See PAGE_PROMPTS.md "Venue Detail" — an aggregate, cross-host view of a
// physical place's history. No net/win-loss/leaderboard anywhere here, per
// REQUIREMENTS.md's Venues section: this is attendance and pot/rake
// aggregates only. `venue_game_rows` / `venue_regulars` (0006 migration) do
// the cross-host aggregation that per-game RLS deliberately doesn't allow
// directly — see that migration's comment for the visibility trade-off.
export function VenueDetail() {
  const { venueId } = useParams()
  const { session, profile, loading } = useAuth()
  const [venueName, setVenueName] = useState<string | null>(null)
  const [rows, setRows] = useState<GameRow[]>([])
  const [regulars, setRegulars] = useState<Regular[]>([])
  const [myRoles, setMyRoles] = useState<Record<string, MyRole>>({})
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!venueId || !profile) return
    let cancelled = false

    async function load() {
      const [{ data: venue }, { data: gameRows }, { data: regularRows }] = await Promise.all([
        supabase.from('venues').select('name').eq('id', venueId).maybeSingle(),
        supabase
          .from('venue_game_rows')
          .select('*')
          .eq('venue_id', venueId)
          .order('closed_at', { ascending: true }),
        supabase
          .from('venue_regulars')
          .select('*')
          .eq('venue_id', venueId)
          .order('games_played', { ascending: false }),
      ])
      if (cancelled) return
      setVenueName(venue?.name ?? null)
      const games = (gameRows ?? []) as GameRow[]
      setRows(games)
      setRegulars((regularRows ?? []) as Regular[])

      // Per-game role split (PAGE_PROMPTS.md: hosted vs played-only rows
      // show different columns; a game the viewer had no part in shows no
      // row at all, only contributing to the aggregates above).
      const roles: Record<string, MyRole> = {}
      await Promise.all(
        games.map(async (g) => {
          if (g.host_id === profile!.id) {
            const { data: transfers } = await supabase
              .from('settlement_transfers')
              .select('status')
              .eq('game_id', g.game_id)
            roles[g.game_id] = {
              kind: 'hosted',
              transfers: transfers?.length ?? 0,
              confirmedTransfers: (transfers ?? []).filter((t) => t.status === 'confirmed').length,
            }
            return
          }
          const { data: myPlayer } = await supabase
            .from('game_players')
            .select('id, cashout')
            .eq('game_id', g.game_id)
            .eq('profile_id', profile!.id)
            .maybeSingle()
          if (!myPlayer) {
            roles[g.game_id] = { kind: 'none' }
            return
          }
          const { data: myReqs } = await supabase
            .from('buyin_requests')
            .select('count')
            .eq('game_id', g.game_id)
            .eq('profile_id', profile!.id)
            .eq('status', 'confirmed')
          const buyins = (myReqs ?? []).reduce((s, r) => s + r.count, 0)
          const net = (myPlayer.cashout ?? 0) - buyins * g.stake
          const { data: myTransfer } = await supabase
            .from('settlement_transfers')
            .select('status')
            .eq('game_id', g.game_id)
            .or(`from_player_id.eq.${myPlayer.id},to_player_id.eq.${myPlayer.id}`)
            .maybeSingle()
          roles[g.game_id] = { kind: 'played', buyins, net, settlementStatus: myTransfer?.status ?? null }
        })
      )
      if (!cancelled) {
        setMyRoles(roles)
        setReady(true)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [venueId, profile])

  if (loading) return <PageSpinner />
  if (!session) return <Navigate to="/continue" replace />
  if (!ready) return <PageSpinner />

  const myRows = rows.filter((g) => myRoles[g.game_id]?.kind !== 'none')

  const gameCount = rows.length
  const dateRange =
    rows.length > 0
      ? `${new Date(rows[0].closed_at).toLocaleDateString()} – ${new Date(
          rows[rows.length - 1].closed_at
        ).toLocaleDateString()}`
      : null
  const hostNames = [...new Set(rows.map((r) => r.host_name))]

  // Each game's pot/rake is converted to chips individually before
  // averaging — never sum raw banks across games and convert once, since
  // different games here can be set to different chip ratios (the
  // cross-ratio gap flagged in REQUIREMENTS.md's Venues section and this
  // migration's comment). Still an average-of-averages, not a fix for that
  // gap, just not making it worse.
  const potChipsPerGame = rows.map((r) => toChips(r.confirmed_buyin_units * r.stake, r.chip_ratio))
  const rakeChipsPerGame = rows.map((r) => toChips(r.rake, r.chip_ratio))
  const avgPot = potChipsPerGame.length
    ? Math.round(potChipsPerGame.reduce((s, v) => s + v, 0) / potChipsPerGame.length)
    : 0
  const avgRake = rakeChipsPerGame.length
    ? Math.round(rakeChipsPerGame.reduce((s, v) => s + v, 0) / rakeChipsPerGame.length)
    : 0
  const ratios = new Set(rows.map((r) => r.chip_ratio))

  const maxPot = Math.max(1, ...potChipsPerGame)
  const maxAttendance = Math.max(1, ...regulars.map((r) => r.games_played))

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="text-lg font-semibold text-ink">{venueName ?? 'Venue'}</h1>
      <p className="mt-1 text-sm text-muted">
        {gameCount} game{gameCount === 1 ? '' : 's'} played{dateRange ? ` · ${dateRange}` : ''}
      </p>

      {gameCount === 0 ? (
        <p className="mt-6 text-center text-sm text-muted">
          No closed games here yet — this page fills in once a game at this venue closes.
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-hairline bg-canvas p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Average pot</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-ink">{avgPot} chips</p>
            </div>
            <div className="rounded-lg border border-hairline bg-canvas p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Average rake</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-ink">{avgRake} chips</p>
            </div>
          </div>
          {ratios.size > 1 && (
            <p className="mt-2 text-xs text-muted">
              ⚠️ Games here use different chip ratios ({[...ratios].join(', ')}) — this average
              blends them, which isn't quite apples-to-apples. See REQUIREMENTS.md's flagged gap.
            </p>
          )}
          <p className="mt-2 text-xs text-muted">
            Hosted by {hostNames.join(', ')}
          </p>

          <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">
            Pot trend
          </h2>
          <svg
            viewBox={`0 0 ${Math.max(rows.length * 24, 24)} 60`}
            preserveAspectRatio="none"
            className="h-[60px] w-full"
            role="img"
          >
            {potChipsPerGame.map((v, i) => {
              const h = Math.max(2, (v / maxPot) * 52)
              return (
                <rect
                  key={i}
                  x={i * 24 + 4}
                  y={56 - h}
                  width={16}
                  height={h}
                  rx={2}
                  className="fill-primary"
                />
              )
            })}
          </svg>

          <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">
            Regulars
          </h2>
          {regulars.length === 0 && <p className="text-sm text-muted">Not enough games yet.</p>}
          <div className="rounded-lg border border-hairline bg-canvas">
            {regulars.map((r) => (
              <div
                key={r.profile_id}
                className="flex items-center gap-3 border-b border-hairline-soft p-2.5 text-sm last:border-none"
              >
                <span className="w-24 flex-none truncate text-ink">{r.full_name}</span>
                <div className="h-2 flex-1 rounded-full bg-surface-strong">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{ width: `${(r.games_played / maxAttendance) * 100}%` }}
                  />
                </div>
                <span className="w-6 flex-none text-right text-muted">{r.games_played}</span>
              </div>
            ))}
          </div>

          <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">
            Games
          </h2>
          {myRows.length === 0 && (
            <p className="text-sm text-muted">
              You haven't played or hosted at this venue — only the aggregate above is visible to
              you.
            </p>
          )}
          <div className="rounded-lg border border-hairline bg-canvas">
            {myRows.map((g) => {
              const role = myRoles[g.game_id]
              return (
                <Link
                  key={g.game_id}
                  to={`/games/${g.game_id}`}
                  className="block border-b border-hairline-soft p-3 last:border-none"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">{g.game_name}</span>
                    <span className="text-xs text-muted">
                      {new Date(g.closed_at).toLocaleDateString()}
                    </span>
                  </div>
                  {role?.kind === 'hosted' && (
                    <p className="mt-1 text-xs text-muted">
                      {toChips(g.confirmed_buyin_units * g.stake, g.chip_ratio)} chips pot ·{' '}
                      {role.transfers} transfer{role.transfers === 1 ? '' : 's'},{' '}
                      {role.confirmedTransfers} confirmed
                    </p>
                  )}
                  {role?.kind === 'played' && (
                    <p className="mt-1 text-xs text-muted">
                      Your buy-ins: {role.buyins} ·{' '}
                      <span className={role.net >= 0 ? 'text-win' : 'text-error'}>
                        {toChips(role.net, g.chip_ratio)} chips
                      </span>
                      {role.settlementStatus ? ` · settlement ${role.settlementStatus}` : ''}
                    </p>
                  )}
                </Link>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
