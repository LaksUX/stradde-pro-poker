import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { toChips, type ChipRatio } from '../lib/chips'
import { PageSpinner } from '../components/ui/Spinner'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Badge } from '../components/ui/badge'
import { NamedAvatar } from '../components/ui/avatar'
import { LineChart } from '../components/ui/line-chart'

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
  const navigate = useNavigate()
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
  const maxAttendance = Math.max(1, ...regulars.map((r) => r.games_played))

  return (
    <div className="mx-auto w-full max-w-sm p-4 sm:p-6">
      <h1 className="type-page-title text-ink">{venueName ?? 'Venue'}</h1>
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
            <Card>
              <CardHeader>
                <CardTitle>Average buy-ins</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="type-figure-md text-ink">{avgPot} chips</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Average rake</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="type-figure-md text-ink">{avgRake} chips</p>
              </CardContent>
            </Card>
          </div>
          <p className="mt-2 text-xs text-muted">
            Hosted by {hostNames.join(', ')}
          </p>

          <h2 className="type-label-caption mb-2 mt-5 text-muted">Buy-ins trend</h2>
          <LineChart points={potChipsPerGame} height={60} />

          <h2 className="type-label-caption mb-2 mt-5 text-muted">Regulars</h2>
          {regulars.length === 0 && <p className="text-sm text-muted">Not enough games yet.</p>}
          {regulars.length > 0 && (
            <Card>
              <CardContent className="space-y-3">
                {regulars.map((r) => (
                  <div key={r.profile_id} className="flex items-center gap-2 text-sm">
                    <NamedAvatar name={r.full_name} className="h-6 w-6" />
                    <span className="w-20 flex-none truncate text-ink">{r.full_name}</span>
                    <div className="h-2 flex-1 rounded-full bg-surface-strong">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${(r.games_played / maxAttendance) * 100}%` }}
                      />
                    </div>
                    <span className="w-6 flex-none text-right text-muted">{r.games_played}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <h2 className="type-label-caption mb-2 mt-5 text-muted">Games</h2>
          {myRows.length === 0 && (
            <p className="text-sm text-muted">
              You haven't played or hosted at this venue — only the aggregate above is visible to
              you.
            </p>
          )}
          {myRows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Game</TableHead>
                  <TableHead className="w-28 text-right">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {myRows.map((g) => {
                  const role = myRoles[g.game_id]
                  return (
                    <TableRow key={g.game_id} className="cursor-pointer" onClick={() => navigate(`/games/${g.game_id}`)}>
                      <TableCell>
                        <div className="flex min-w-0 items-center gap-2">
                          <NamedAvatar name={g.game_name} className="shrink-0" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink">{g.game_name}</p>
                            <p className="truncate text-xs text-muted">{new Date(g.closed_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {role?.kind === 'hosted' && (
                          <>
                            <p className="type-figure-md text-ink">
                              {toChips(g.confirmed_buyin_units * g.stake, g.chip_ratio)} chips
                            </p>
                            <p className="text-xs text-muted">
                              {role.confirmedTransfers}/{role.transfers} confirmed
                            </p>
                          </>
                        )}
                        {role?.kind === 'played' && (
                          <>
                            <p className={`type-figure-md ${role.net >= 0 ? 'text-win' : 'text-error'}`}>
                              {toChips(role.net, g.chip_ratio)} chips
                            </p>
                            <div className="mt-0.5 flex items-center justify-end gap-1 text-xs text-muted">
                              <span>{role.buyins} buy-ins</span>
                              {role.settlementStatus && (
                                <Badge
                                  variant={
                                    role.settlementStatus === 'confirmed'
                                      ? 'win'
                                      : role.settlementStatus === 'disputed'
                                        ? 'error'
                                        : 'muted'
                                  }
                                >
                                  {role.settlementStatus}
                                </Badge>
                              )}
                            </div>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </>
      )}
    </div>
  )
}
