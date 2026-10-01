import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth, type Profile } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { toChips, type ChipRatio } from '../lib/chips'
import { runWrite } from '../lib/errors'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/confirmDialog'
import { isPushSupported, isSubscribedToPush, subscribeToPush, unsubscribeFromPush } from '../lib/push'
import { Button } from '../components/ui/Button'
import { PageSpinner, InlineSpinner } from '../components/ui/Spinner'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { ListGroup, ListRow, ListDate } from '../components/ui/list-row'
import { Badge } from '../components/ui/badge'
import { NamedAvatar } from '../components/ui/avatar'
import { LineChart } from '../components/ui/line-chart'
import { Plus, Bell, BellOff } from 'lucide-react'

type HostedGame = {
  id: string
  name: string
  closed_at: string | null
  buyins: number
  rake: number
  chip_ratio: ChipRatio
}
type PlayedGame = {
  id: string
  name: string
  closed_at: string | null
  net: number
  buyins: number
  cashout: number
  chip_ratio: ChipRatio
  venue: string | null
}
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
type AdminGameRow = {
  id: string
  name: string
  status: 'scheduled' | 'live' | 'closed'
  scheduled_for: string
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
  const [adminGames, setAdminGames] = useState<AdminGameRow[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pendingRequestCount, setPendingRequestCount] = useState(0)

  useEffect(() => {
    if (isPushSupported()) isSubscribedToPush().then(setPushEnabled)
  }, [])

  async function togglePush() {
    if (!profile || pushBusy) return
    setPushBusy(true)
    try {
      if (pushEnabled) {
        await unsubscribeFromPush()
        setPushEnabled(false)
        toast.success('Notifications turned off')
      } else {
        await subscribeToPush(profile.id)
        setPushEnabled(true)
        toast.success('Notifications turned on')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update notifications')
    } finally {
      setPushBusy(false)
    }
  }

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
        .select(
          'id, cashout, game_id, games(id, name, closed_at, status, stake, chip_ratio, venue_freetext)'
        )
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
        results.push({
          id: g.id,
          name: g.name,
          closed_at: g.closed_at,
          net,
          buyins: invested,
          cashout: row.cashout ?? 0,
          chip_ratio: g.chip_ratio,
          venue: g.venue_freetext,
        })
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

    // Every game this profile hosts, any status — not just closed ones like
    // loadHostTab's list — so a test game left scheduled or live is still
    // reachable to delete, not just games that were actually finished.
    async function loadAdminGames() {
      if (profile!.role !== 'admin') return
      const { data } = await supabase
        .from('games')
        .select('id, name, status, scheduled_for')
        .order('scheduled_for', { ascending: false })
      if (!cancelled) setAdminGames((data ?? []) as AdminGameRow[])
    }

    // What the notification bell's badge counts — the same "new buy-in/join
    // request" event that actually triggers a push (see
    // 0015_push_notifications.sql), so the number on the bell always means
    // something a push already would have told a host about. RLS already
    // scopes buyin_requests to games this profile hosts, so a plain player
    // just gets 0 back with no extra guard needed.
    async function loadPendingRequestCount() {
      if (!isApprovedHostRole(profile!) || !profile!.approved) {
        if (!cancelled) setPendingRequestCount(0)
        return
      }
      const { count } = await supabase
        .from('buyin_requests')
        .select('id, games!inner(status)', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq('games.status', 'live')
      if (!cancelled) setPendingRequestCount(count ?? 0)
    }

    setLoadingData(true)
    Promise.all([
      loadHostTab(),
      loadPlayerTab(),
      loadSettlements(),
      loadAdminRows(),
      loadAdminGames(),
      loadPendingRequestCount(),
    ]).then(() => {
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

  // The only way anyone becomes a host now — no more self-serve apply, so
  // there's no "pending" state to approve into; this grants the role and
  // approves it in the same step. Mirrors Admin.tsx's makeHost/removeHost —
  // same two actions, kept in sync since this tab replaced that page as the
  // place admins actually use day to day.
  async function makeHost(id: string) {
    const ok = await runWrite(
      () => supabase.from('profiles').update({ role: 'host', approved: true }).eq('id', id),
      'Making host'
    )
    if (ok) setAdminRows((prev) => prev.map((r) => (r.id === id ? { ...r, role: 'host', approved: true } : r)))
  }

  async function removeHost(id: string) {
    const ok = await runWrite(
      () => supabase.from('profiles').update({ role: 'player', approved: false }).eq('id', id),
      'Removing host'
    )
    if (ok) setAdminRows((prev) => prev.map((r) => (r.id === id ? { ...r, role: 'player', approved: false } : r)))
  }

  // Cascades game_players/buyin_requests/settlement_transfers automatically
  // (all reference games.id with on delete cascade — 0001_core_schema.sql) —
  // deleting a test game cleans up everything tied to it in one action.
  async function deleteGame(id: string) {
    const confirmed = await confirmDialog(
      'Delete this game? This removes all its buy-ins, cash-outs, and settlement data too — this cannot be undone.',
      { confirmLabel: 'Delete game', danger: true }
    )
    if (!confirmed) return
    const ok = await runWrite(() => supabase.from('games').delete().eq('id', id), 'Deleting game')
    if (ok) setAdminGames((prev) => prev.filter((g) => g.id !== id))
  }

  // Unlike games, this does NOT cascade — venues.created_by, games.host_id,
  // and hosting_entities.owner_profile_id all reference profiles with no
  // cascade, so deleting a profile that ever hosted anything fails with a
  // real FK error surfaced via runWrite's toast, telling the admin to
  // delete those first rather than silently taking games/venues down with
  // them.
  async function deleteProfile(id: string) {
    const confirmed = await confirmDialog(
      "Delete this player's profile? This cannot be undone.",
      { confirmLabel: 'Delete player', danger: true }
    )
    if (!confirmed) return
    const ok = await runWrite(() => supabase.from('profiles').delete().eq('id', id), 'Deleting player')
    if (ok) setAdminRows((prev) => prev.filter((r) => r.id !== id))
  }

  const isApprovedHost = !!profile && isApprovedHostRole(profile) && profile.approved
  // A plain player can never be host or admin — no tab chrome to switch
  // between screens that will only ever show one of them "apply to host"
  // or "pending" copy for. Only someone who's ever become a host or admin
  // has more than one real tab to switch between.
  const showTabSwitcher = profile?.role !== 'player'
  const lifetimeNet = playedGames.reduce((s, g) => s + toChips(g.net, g.chip_ratio), 0)
  const lifetimeBuyins = playedGames.reduce((s, g) => s + toChips(g.buyins, g.chip_ratio), 0)
  const lifetimeCashout = playedGames.reduce((s, g) => s + toChips(g.cashout, g.chip_ratio), 0)
  const wins = playedGames.filter((g) => g.net > 0).length
  // Converted to chips PER GAME before summing/averaging — never sum raw
  // banks across games and convert once, since different games here can be
  // on different chip ratios (same pitfall GameDetail's venue trend chart
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
      <header>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <NamedAvatar name={profile?.full_name ?? '?'} />
            <h1 className="type-page-title text-ink">
              Hey{profile?.full_name ? ` ${profile.full_name}` : ''}
            </h1>
          </div>
          {isPushSupported() && (
            <button
              type="button"
              aria-label={pushEnabled ? 'Turn off notifications' : 'Turn on notifications'}
              disabled={pushBusy}
              onClick={togglePush}
              className="relative text-muted hover:text-ink disabled:opacity-50"
            >
              {pushEnabled ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
              {pendingRequestCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
                  {pendingRequestCount}
                </span>
              )}
            </button>
          )}
        </div>
        <button className="mt-2 text-xs text-muted underline" onClick={handleLogout}>
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
                  <p className="flex items-baseline gap-1.5">
                    <span className="type-figure-hero text-ink">{lifetimeNet}</span>
                    <span className="text-sm text-muted">chips</span>
                  </p>
                  <Badge variant={lifetimeNet >= 0 ? 'win' : 'error'}>
                    {lifetimeNet >= 0 ? 'Winning' : 'Down overall'}
                  </Badge>
                </div>
                <p className="mt-3 text-xs text-muted">
                  {wins} win{wins === 1 ? '' : 's'} · {playedGames.length} game
                  {playedGames.length === 1 ? '' : 's'} played
                </p>
                <div className="mt-3 grid grid-cols-2 gap-1.5 text-center">
                  <div className="rounded-lg bg-surface-strong px-2 py-2.5">
                    <p className="text-[11px] text-muted">Buy-ins</p>
                    <p className="type-figure-md mt-0.5 text-ink">{lifetimeBuyins} chips</p>
                  </div>
                  <div className="rounded-lg bg-surface-strong px-2 py-2.5">
                    <p className="text-[11px] text-muted">Cash-out</p>
                    <p className="type-figure-md mt-0.5 text-ink">{lifetimeCashout} chips</p>
                  </div>
                </div>
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
                      <div key={g.id}>
                        <ListDate>{formatClosedDate(g.closed_at)}</ListDate>
                        <ListRow
                          className="cursor-pointer"
                          onClick={() => navigate(`/games/${g.id}/my-game`)}
                          avatar={<NamedAvatar name={g.name} className="h-12 w-12" />}
                          title={g.name}
                          subtitle={g.venue && <Badge variant="muted">{g.venue}</Badge>}
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
                      </div>
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
                        onClick={() => navigate(`/games/${r.gameId}/my-game`)}
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
                        <div key={g.id}>
                          <ListDate>{formatClosedDate(g.closed_at)}</ListDate>
                          <ListRow
                            className="cursor-pointer"
                            onClick={() => navigate(`/games/${g.id}`)}
                            avatar={<NamedAvatar name={g.name} className="h-12 w-12" />}
                            title={g.name}
                            trailing={
                              <span className="type-figure-md whitespace-nowrap text-ink">
                                {toChips(g.buyins, g.chip_ratio)} chips
                              </span>
                            }
                          />
                        </div>
                      ))}
                    </ListGroup>
                  )}
                </div>
              </>
            ) : (
              <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
                Hosting is granted by an admin — ask one to make you a host.
              </p>
            )}
          </TabsContent>
        )}

        {!loadingData && profile?.role === 'admin' && (
          <TabsContent value="admin" className="mt-4">
            <h2 className="type-label-caption mb-2 text-muted">Games</h2>
            {adminGames.length === 0 ? (
              <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
                No games yet.
              </p>
            ) : (
              <ListGroup>
                {adminGames.map((g) => (
                  <ListRow
                    key={g.id}
                    title={g.name}
                    subtitle={new Date(g.scheduled_for).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                    trailing={
                      <>
                        <Badge variant={g.status === 'live' ? 'win' : 'muted'}>{g.status}</Badge>
                        <Button variant="danger" className="h-8 px-3 text-xs" onClick={() => deleteGame(g.id)}>
                          Delete
                        </Button>
                      </>
                    }
                  />
                ))}
              </ListGroup>
            )}

            <h2 className="type-label-caption mb-2 mt-5 text-muted">Profiles</h2>
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
                        {r.role === 'player' && (
                          <Button variant="primary" className="h-8 px-3 text-xs" onClick={() => makeHost(r.id)}>
                            Make host
                          </Button>
                        )}
                        {r.role === 'host' && (
                          <Button
                            variant={r.approved ? 'danger' : 'primary'}
                            className="h-8 px-3 text-xs"
                            onClick={() => (r.approved ? removeHost(r.id) : makeHost(r.id))}
                          >
                            {r.approved ? 'Revoke' : 'Approve'}
                          </Button>
                        )}
                        <Button variant="danger" className="h-8 px-3 text-xs" onClick={() => deleteProfile(r.id)}>
                          Delete
                        </Button>
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
