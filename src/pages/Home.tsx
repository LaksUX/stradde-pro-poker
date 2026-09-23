import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth, type Profile } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { toChips, type ChipRatio } from '../lib/chips'
import { runWrite } from '../lib/errors'
import { Button } from '../components/ui/Button'
import { PageSpinner, InlineSpinner } from '../components/ui/Spinner'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { ListGroup, ListRow } from '../components/ui/list-row'
import { Badge } from '../components/ui/badge'
import { NamedAvatar } from '../components/ui/avatar'
import { LineChart } from '../components/ui/line-chart'
import { Plus } from 'lucide-react'

type HostedGame = {
  id: string
  name: string
  closed_at: string | null
  buyins: number
  rake: number
  chip_ratio: ChipRatio
}
type PlayedGame = { id: string; name: string; closed_at: string | null; net: number; chip_ratio: ChipRatio }
type SettlementRow = {
  id: string
  gameId: string
  gameName: string
  direction: 'owe' | 'owed'
  otherName: string
  amount: number
  status: 'pending' | 'confirmed' | 'disputed'
  chip_ratio: ChipRatio
}
type AdminRow = {
  id: string
  full_name: string | null
  phone: string | null
  role: 'player' | 'host' | 'admin'
  approved: boolean
}

// An admin can also act as a host (0009_admin_can_host.sql widens the
// matching RLS insert policies to match) — kept as one helper so every
// place on this screen that gates on "can this profile host" agrees.
function isApprovedHostRole(profile: Profile): boolean {
  return profile.role === 'host' || profile.role === 'admin'
}

function formatClosedDate(closedAt: string | null): string | undefined {
  if (!closedAt) return undefined
  return new Date(closedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// See PAGE_PROMPTS.md "Home". Player/Host/Admin all live as tabs on this one
// screen now — Admin used to be a separate page reached by a text link;
// folding its profile-approval queue in here (with a pending-count badge on
// the tab itself) means an admin sees what needs action without a detour.
export function Home() {
  const { session, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'host' | 'player' | 'admin'>('player')
  const [hostedGames, setHostedGames] = useState<HostedGame[]>([])
  const [playedGames, setPlayedGames] = useState<PlayedGame[]>([])
  const [settlementRows, setSettlementRows] = useState<SettlementRow[]>([])
  const [adminRows, setAdminRows] = useState<AdminRow[]>([])
  const [loadingData, setLoadingData] = useState(true)

  useEffect(() => {
    if (!profile) return
    let cancelled = false

    async function loadHostTab() {
      if (!isApprovedHostRole(profile!) || !profile!.approved) return
      const { data: games } = await supabase
        .from('games')
        .select('id, name, closed_at, rake, stake, chip_ratio')
        .eq('host_id', profile!.id)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
      if (!games || cancelled) return

      const results: HostedGame[] = []
      for (const g of games) {
        const { data: reqs } = await supabase
          .from('buyin_requests')
          .select('count')
          .eq('game_id', g.id)
          .eq('status', 'confirmed')
        const totalBuyins = (reqs ?? []).reduce((s, r) => s + r.count, 0) * g.stake
        results.push({
          id: g.id,
          name: g.name,
          closed_at: g.closed_at,
          buyins: totalBuyins,
          rake: g.rake,
          chip_ratio: g.chip_ratio,
        })
      }
      if (!cancelled) setHostedGames(results)
    }

    async function loadPlayerTab() {
      const { data: myRows } = await supabase
        .from('game_players')
        .select('id, cashout, game_id, games(id, name, closed_at, status, stake, chip_ratio)')
        .eq('profile_id', profile!.id)
      if (!myRows || cancelled) return

      const results: PlayedGame[] = []
      for (const row of myRows as any[]) {
        const g = row.games
        if (!g || g.status !== 'closed') continue
        const { data: reqs } = await supabase
          .from('buyin_requests')
          .select('count')
          .eq('game_player_id', row.id)
          .eq('status', 'confirmed')
        const invested = (reqs ?? []).reduce((s, r) => s + r.count, 0) * g.stake
        const net = (row.cashout ?? 0) - invested
        results.push({ id: g.id, name: g.name, closed_at: g.closed_at, net, chip_ratio: g.chip_ratio })
      }
      results.sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))
      if (!cancelled) setPlayedGames(results)
    }

    async function loadSettlements() {
      const { data: myPlayers } = await supabase
        .from('game_players')
        .select('id, game_id')
        .eq('profile_id', profile!.id)
      const myPlayerIds = (myPlayers ?? []).map((p) => p.id)
      if (myPlayerIds.length === 0) {
        if (!cancelled) setSettlementRows([])
        return
      }
      const orFilter = myPlayerIds.map((id) => `from_player_id.eq.${id},to_player_id.eq.${id}`).join(',')
      const { data: transfers } = await supabase
        .from('settlement_transfers')
        .select('id, from_player_id, to_player_id, amount, status, game_id')
        .or(orFilter)

      const results: SettlementRow[] = []
      for (const t of transfers ?? []) {
        const mine = myPlayerIds.includes(t.from_player_id) ? t.from_player_id : t.to_player_id
        const otherId = t.from_player_id === mine ? t.to_player_id : t.from_player_id
        const direction: 'owe' | 'owed' = t.from_player_id === mine ? 'owe' : 'owed'
        const { data: other } = await supabase
          .from('game_players')
          .select('profiles(full_name)')
          .eq('id', otherId)
          .maybeSingle()
        const { data: g } = await supabase
          .from('games')
          .select('name, chip_ratio')
          .eq('id', t.game_id)
          .maybeSingle()
        results.push({
          id: t.id,
          gameId: t.game_id,
          gameName: g?.name ?? '—',
          direction,
          otherName: (other as any)?.profiles?.full_name ?? '—',
          amount: t.amount,
          status: t.status,
          chip_ratio: (g?.chip_ratio as ChipRatio) ?? '1:1',
        })
      }
      if (!cancelled) setSettlementRows(results)
    }

    async function loadAdminRows() {
      if (profile!.role !== 'admin') return
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, phone, role, approved')
        .neq('role', 'admin')
      if (!cancelled) setAdminRows((data ?? []) as AdminRow[])
    }

    setLoadingData(true)
    Promise.all([loadHostTab(), loadPlayerTab(), loadSettlements(), loadAdminRows()]).then(() => {
      if (!cancelled) setLoadingData(false)
    })
    return () => {
      cancelled = true
    }
  }, [profile])

  if (loading) return <PageSpinner />
  if (!session) return <Navigate to="/continue" replace />

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/continue')
  }

  async function setApproval(id: string, approved: boolean) {
    const ok = await runWrite(
      () => supabase.from('profiles').update({ approved }).eq('id', id),
      approved ? 'Approving host' : 'Revoking host'
    )
    if (ok) setAdminRows((prev) => prev.map((r) => (r.id === id ? { ...r, approved } : r)))
  }

  const isApprovedHost = !!profile && isApprovedHostRole(profile) && profile.approved
  // A plain player can never be host or admin — no tab chrome to switch
  // between screens that will only ever show one of them "apply to host"
  // or "pending" copy for. Only someone who's ever become a host or admin
  // has more than one real tab to switch between.
  const showTabSwitcher = profile?.role !== 'player'
  const lifetimeNet = playedGames.reduce((s, g) => s + toChips(g.net, g.chip_ratio), 0)
  const wins = playedGames.filter((g) => g.net > 0).length
  // Converted to chips PER GAME before summing/averaging — never sum raw
  // banks across games and convert once, since different games here can be
  // on different chip ratios (same pitfall VenueDetail's equivalent stat
  // already guards against).
  const totalRake = hostedGames.reduce((s, g) => s + toChips(g.rake, g.chip_ratio), 0)
  const avgBuyins = hostedGames.length
    ? Math.round(hostedGames.reduce((s, g) => s + toChips(g.buyins, g.chip_ratio), 0) / hostedGames.length)
    : 0
  const pendingAdminCount = adminRows.filter((r) => r.role === 'host' && !r.approved).length

  // Chronological (oldest → newest) for the chart, independent of the table
  // above it which stays newest-first.
  const chartGames = [...playedGames].reverse()
  const netChartPoints = chartGames.map((g) => toChips(g.net, g.chip_ratio))

  return (
    <div className="mx-auto w-full max-w-sm p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <NamedAvatar name={profile?.full_name ?? '?'} />
          <h1 className="type-page-title text-ink">
            Hey{profile?.full_name ? ` ${profile.full_name}` : ''}
          </h1>
        </div>
        <button className="text-xs text-muted underline" onClick={handleLogout}>
          Log out
        </button>
      </header>

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'host' | 'player' | 'admin')} className="mt-5">
        {showTabSwitcher && (
          <TabsList>
            <TabsTrigger value="player">Player</TabsTrigger>
            <TabsTrigger value="host">Host</TabsTrigger>
            {profile?.role === 'admin' && (
              <TabsTrigger value="admin" className="relative">
                Admin
                {pendingAdminCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
                    {pendingAdminCount}
                  </span>
                )}
              </TabsTrigger>
            )}
          </TabsList>
        )}

        {loadingData && <InlineSpinner />}

        {!loadingData && (
          <TabsContent value="player" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Lifetime net</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <p className="type-figure-hero text-ink">{lifetimeNet} chips</p>
                  <Badge variant={lifetimeNet >= 0 ? 'win' : 'error'}>
                    {lifetimeNet >= 0 ? 'Winning' : 'Down overall'}
                  </Badge>
                </div>
                <p className="mt-3 text-xs text-muted">
                  {wins} win{wins === 1 ? '' : 's'} · {playedGames.length} game
                  {playedGames.length === 1 ? '' : 's'} played
                </p>
                {netChartPoints.length > 0 && (
                  <LineChart
                    points={netChartPoints}
                    colorBySign
                    className="mt-3 h-16 border-t border-hairline-soft pt-3"
                  />
                )}
              </CardContent>
            </Card>

            <Tabs defaultValue="upcoming" className="mt-5">
              <TabsList>
                <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                <TabsTrigger value="games">My games</TabsTrigger>
                <TabsTrigger value="settlements">Settlements</TabsTrigger>
              </TabsList>

              {/* Not built yet — see this round's chat reply for the
                  proposed design (query games where the player has a
                  confirmed or pending game_players/invite row and
                  status='scheduled', with a Confirm action per row). Kept
                  as the same list shape as the two tabs beside it so all
                  three read as one consistent component once it's wired
                  up. */}
              <TabsContent value="upcoming" className="mt-4">
                <h2 className="type-label-caption mb-2 text-muted">Upcoming</h2>
                <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
                  Coming soon — scheduled games you can confirm for will show up here.
                </p>
              </TabsContent>

              <TabsContent value="games" className="mt-4">
                <h2 className="type-label-caption mb-2 text-muted">My games</h2>
                {playedGames.length === 0 ? (
                  <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
                    No closed games yet.
                  </p>
                ) : (
                  <ListGroup>
                    {playedGames.map((g) => (
                      <ListRow
                        key={g.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/games/${g.id}`)}
                        avatar={<NamedAvatar name={g.name} className="h-12 w-12" />}
                        title={g.name}
                        meta={formatClosedDate(g.closed_at)}
                        trailing={
                          <span
                            className={`type-figure-md whitespace-nowrap ${
                              g.net >= 0 ? 'text-win' : 'text-error'
                            }`}
                          >
                            {toChips(g.net, g.chip_ratio)} chips
                          </span>
                        }
                      />
                    ))}
                  </ListGroup>
                )}
              </TabsContent>

              <TabsContent value="settlements" className="mt-4">
                <h2 className="type-label-caption mb-2 text-muted">Settlements</h2>
                {settlementRows.length === 0 ? (
                  <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
                    No settlements yet.
                  </p>
                ) : (
                  <ListGroup>
                    {settlementRows.map((r) => (
                      <ListRow
                        key={r.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/games/${r.gameId}`)}
                        avatar={<NamedAvatar name={r.otherName} className="h-12 w-12" />}
                        title={r.otherName}
                        subtitle={
                          <>
                            <span className={r.direction === 'owe' ? 'text-error' : 'text-win'}>
                              {r.direction === 'owe' ? 'You owe' : 'Owed to you'}
                            </span>
                            {' · '}
                            {r.gameName}
                          </>
                        }
                        trailing={
                          <>
                            <span
                              className={`type-figure-md whitespace-nowrap ${
                                r.direction === 'owe' ? 'text-error' : 'text-win'
                              }`}
                            >
                              {toChips(r.amount, r.chip_ratio)} chips
                            </span>
                            <Badge
                              variant={
                                r.status === 'confirmed' ? 'win' : r.status === 'disputed' ? 'error' : 'muted'
                              }
                            >
                              {r.status}
                            </Badge>
                          </>
                        }
                      />
                    ))}
                  </ListGroup>
                )}
              </TabsContent>
            </Tabs>

            {!showTabSwitcher && (
              <div className="mt-5 rounded-lg border border-hairline bg-canvas p-4 text-center">
                <p className="mb-3 text-sm text-muted">
                  Run your own games instead of just joining them.
                </p>
                <Button variant="ghost" onClick={() => navigate('/apply-to-host')}>
                  Apply to host
                </Button>
              </div>
            )}
          </TabsContent>
        )}

        {!loadingData && (
          <TabsContent value="host" className="mt-4">
            {isApprovedHost ? (
              <>
                <h2 className="type-label-caption text-muted">Your games</h2>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Card className="text-center">
                    <CardHeader>
                      <CardTitle className="mx-auto">Games hosted</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="type-figure-md text-ink">{hostedGames.length}</p>
                    </CardContent>
                  </Card>
                  <Card className="text-center">
                    <CardHeader>
                      <CardTitle className="mx-auto">Rake collected</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="type-figure-md text-ink">{totalRake} chips</p>
                    </CardContent>
                  </Card>
                  <Card className="col-span-2 text-center">
                    <CardHeader>
                      <CardTitle className="mx-auto">Average buy-ins</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="type-figure-md text-ink">{avgBuyins} chips</p>
                    </CardContent>
                  </Card>
                </div>

                <div className="mt-4">
                  {hostedGames.length === 0 ? (
                    <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
                      No closed games yet.
                    </p>
                  ) : (
                    <ListGroup>
                      {hostedGames.map((g) => (
                        <ListRow
                          key={g.id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/games/${g.id}`)}
                          avatar={<NamedAvatar name={g.name} className="h-12 w-12" />}
                          title={g.name}
                          meta={formatClosedDate(g.closed_at)}
                          trailing={
                            <span className="type-figure-md whitespace-nowrap text-ink">
                              {toChips(g.buyins, g.chip_ratio)} chips
                            </span>
                          }
                        />
                      ))}
                    </ListGroup>
                  )}
                </div>
              </>
            ) : profile?.role === 'host' ? (
              <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
                Your host application is pending approval.
              </p>
            ) : (
              <div className="rounded-lg border border-hairline bg-canvas p-4 text-center">
                <p className="mb-3 text-sm text-muted">
                  Run your own games instead of just joining them.
                </p>
                <Button variant="ghost" onClick={() => navigate('/apply-to-host')}>
                  Apply to host
                </Button>
              </div>
            )}
          </TabsContent>
        )}

        {!loadingData && profile?.role === 'admin' && (
          <TabsContent value="admin" className="mt-4">
            {adminRows.length === 0 ? (
              <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
                No profiles yet.
              </p>
            ) : (
              <ListGroup>
                {adminRows.map((r) => (
                  <ListRow
                    key={r.id}
                    avatar={<NamedAvatar name={r.full_name ?? '—'} className="h-12 w-12" />}
                    title={r.full_name ?? '—'}
                    subtitle={r.phone}
                    trailing={
                      <>
                        <Badge variant={r.role === 'host' && r.approved ? 'win' : 'muted'}>
                          {r.role === 'host' ? (r.approved ? 'Approved' : 'Pending') : 'Player'}
                        </Badge>
                        {r.role === 'host' && (
                          <Button
                            variant={r.approved ? 'danger' : 'primary'}
                            className="h-8 px-3 text-xs"
                            onClick={() => setApproval(r.id, !r.approved)}
                          >
                            {r.approved ? 'Revoke' : 'Approve'}
                          </Button>
                        )}
                      </>
                    }
                  />
                ))}
              </ListGroup>
            )}
          </TabsContent>
        )}
      </Tabs>

      {tab === 'host' && isApprovedHost && (
        <button
          type="button"
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-elevated transition-colors hover:bg-primary-active"
          onClick={() => navigate('/games/new')}
          aria-label="New game"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}
    </div>
  )
}
