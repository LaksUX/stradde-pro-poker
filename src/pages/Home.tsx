import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth, type Profile } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { toChips, type ChipRatio } from '../lib/chips'
import { runWrite } from '../lib/errors'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/confirmDialog'
import { isPushSupported, isSubscribedToPush, subscribeToPush, unsubscribeFromPush } from '../lib/push'
import { Button } from '../components/ui/button'
import { PageSpinner, InlineSpinner } from '../components/ui/spinner'
import { Separator } from '../components/ui/separator'
import { StatCard } from '../components/ui/stat-card'
import { Tabs, TabsList, TabsTrigger, TabsContent, SubTabsList, SubTabsTrigger } from '../components/ui/tabs'
import { ListGroup, ListRow, ListDate } from '../components/ui/list-row'
import { Badge } from '../components/ui/badge'
import { NamedAvatar } from '../components/ui/avatar'
import { ChipsFigure } from '../components/ui/chips-figure'
import { SettlementRow } from '../components/ui/settlement-row'
import { LineChart } from '../components/ui/line-chart'
import { GroupSettingsSheet } from '../components/ui/group-settings-sheet'
import { getMyGroup } from '../lib/groupAuth'
import { Plus, Bell, BellOff, Trash2, Settings } from 'lucide-react'

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

function isApprovedHostRole(profile: Profile): boolean {
  return profile.role === 'host' || profile.role === 'admin'
}

function formatClosedDate(closedAt: string | null): string | undefined {
  if (!closedAt) return undefined
  return new Date(closedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function Home() {
  const { session, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'host' | 'player' | 'admin'>('player')
  const [groupOpen, setGroupOpen] = useState(false)
  const [needsGroup, setNeedsGroup] = useState(false)
  const isHostRole = !!profile && profile.role !== 'player'
  useEffect(() => {
    if (!isHostRole) return
    getMyGroup()
      .then((g) => setNeedsGroup(g === null))
      .catch(() => {})
  }, [isHostRole])
  const [hostedGames, setHostedGames] = useState<HostedGame[]>([])
  const [playedGames, setPlayedGames] = useState<PlayedGame[]>([])
  const [settlementRows, setSettlementRows] = useState<SettlementRow[]>([])
  const [adminRows, setAdminRows] = useState<AdminRow[]>([])
  const [adminGames, setAdminGames] = useState<AdminGameRow[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pendingRequestCount, setPendingRequestCount] = useState(0)
  const [playerSection, setPlayerSection] = useState<'upcoming' | 'games' | 'settlements'>('games')
  const [adminSection, setAdminSection] = useState<'games' | 'people'>('games')

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

    async function loadAdminGames() {
      if (profile!.role !== 'admin') return
      const { data } = await supabase
        .from('games')
        .select('id, name, status, scheduled_for')
        .order('scheduled_for', { ascending: false })
      if (!cancelled) setAdminGames((data ?? []) as AdminGameRow[])
    }

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

  async function deleteGame(id: string) {
    const confirmed = await confirmDialog(
      'Delete this game? This removes all its buy-ins, cash-outs, and settlement data too — this cannot be undone.',
      { confirmLabel: 'Delete game', danger: true }
    )
    if (!confirmed) return
    const ok = await runWrite(() => supabase.from('games').delete().eq('id', id), 'Deleting game')
    if (ok) setAdminGames((prev) => prev.filter((g) => g.id !== id))
  }

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
  const showTabSwitcher = profile?.role !== 'player'
  const lifetimeNet = playedGames.reduce((s, g) => s + toChips(g.net, g.chip_ratio), 0)
  const lifetimeBuyins = playedGames.reduce((s, g) => s + toChips(g.buyins, g.chip_ratio), 0)
  const lifetimeCashout = playedGames.reduce((s, g) => s + toChips(g.cashout, g.chip_ratio), 0)
  const wins = playedGames.filter((g) => g.net > 0).length
  const totalRake = hostedGames.reduce((s, g) => s + toChips(g.rake, g.chip_ratio), 0)
  const avgBuyins = hostedGames.length
    ? Math.round(hostedGames.reduce((s, g) => s + toChips(g.buyins, g.chip_ratio), 0) / hostedGames.length)
    : 0
  const pendingAdminCount = adminRows.filter((r) => r.role === 'host' && !r.approved).length

  const chartGames = [...playedGames].reverse()
  let running = 0
  const netChartPoints = chartGames.map((g) => (running += toChips(g.net, g.chip_ratio)))
  const netChartLabels = chartGames.map((g) =>
    g.closed_at ? new Date(g.closed_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''
  )

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
          <div className="flex items-center gap-3">
          {profile && profile.role !== 'player' && (
            <button
              type="button"
              aria-label="Group and sign-in settings"
              onClick={() => setGroupOpen(true)}
              className="text-muted hover:text-ink"
            >
              <Settings className="h-5 w-5" />
            </button>
          )}
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
                <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[12px] font-bold text-white">
                  {pendingRequestCount}
                </span>
              )}
            </button>
          )}
          </div>
        </div>
        <GroupSettingsSheet
          open={groupOpen}
          onOpenChange={setGroupOpen}
          onGroupChange={(has) => setNeedsGroup(!has)}
        />
        {needsGroup && (
          <button
            type="button"
            onClick={() => setGroupOpen(true)}
            className="mt-3 w-full rounded-lg border border-primary/30 bg-primary/5 p-3 text-left"
          >
            <span className="block text-sm font-semibold text-ink">Get your group ID</span>
            <span className="block text-xs text-muted">
              Set a 4-digit PIN so you can sign back in on a new phone.
            </span>
          </button>
        )}
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
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[12px] font-bold text-white">
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
            <h2 className="type-label-caption text-muted">Your results</h2>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <StatCard
                className="col-span-2"
                title="Lifetime net"
                hero
                signed
                tone="auto"
                value={lifetimeNet}
                trend={
                  playedGames.length > 0
                    ? { amount: toChips(playedGames[0].net, playedGames[0].chip_ratio), label: 'last game' }
                    : undefined
                }
              >
                {netChartPoints.length > 1 && (
                  <LineChart
                    points={netChartPoints}
                    labels={netChartLabels}
                    colorBySign
                    format={(v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US')}`}
                    height={150}
                    className="mt-3"
                  />
                )}
              </StatCard>
              <StatCard title="Games played" value={playedGames.length} />
              <StatCard
                title="Win rate"
                value={playedGames.length ? Math.round((wins / playedGames.length) * 100) : 0}
                suffix="%"
              />
              <StatCard title="Buy-ins" value={lifetimeBuyins} />
              <StatCard title="Cash-out" value={lifetimeCashout} />
            </div>

            <Separator className="mt-6 bg-hairline" />

            <Tabs
              value={playerSection}
              onValueChange={(v) => setPlayerSection(v as typeof playerSection)}
              className="mt-4"
            >
              <SubTabsList>
                <SubTabsTrigger value="upcoming">Upcoming</SubTabsTrigger>
                <SubTabsTrigger value="games">My games</SubTabsTrigger>
                <SubTabsTrigger value="settlements">Settlements</SubTabsTrigger>
              </SubTabsList>
            </Tabs>

            <div className="mt-3">
              {playerSection === 'upcoming' && (
                <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
                  Coming soon — scheduled games you can confirm for will show up here.
                </p>
              )}

              {playerSection === 'games' && (
                playedGames.length === 0 ? (
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
                            <ChipsFigure amount={g.net} ratio={g.chip_ratio} tone={g.net >= 0 ? 'win' : 'error'} />
                          }
                        />
                      </div>
                    ))}
                  </ListGroup>
                )
              )}

              {playerSection === 'settlements' && (
                settlementRows.length === 0 ? (
                  <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
                    No settlements yet.
                  </p>
                ) : (
                  <ListGroup>
                    {settlementRows.map((r) => (
                      <SettlementRow
                        key={r.id}
                        onClick={() => navigate(`/games/${r.gameId}/my-game`)}
                        otherName={r.otherName}
                        direction={r.direction}
                        amount={r.amount}
                        ratio={r.chip_ratio}
                        status={r.status}
                        context={r.gameName}
                      />
                    ))}
                  </ListGroup>
                )
              )}
            </div>
          </TabsContent>
        )}

        {!loadingData && (
          <TabsContent value="host" className="mt-4">
            {isApprovedHost ? (
              <>
                <h2 className="type-label-caption text-muted">Your games</h2>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <StatCard title="Games hosted" value={hostedGames.length} />
                  <StatCard title="Rake collected" value={totalRake} />
                  <StatCard className="col-span-2" title="Average buy-ins" value={avgBuyins} />
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
                            trailing={<ChipsFigure amount={g.buyins} ratio={g.chip_ratio} />}
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
            <Tabs
              value={adminSection}
              onValueChange={(v) => setAdminSection(v as typeof adminSection)}
            >
              <SubTabsList>
                <SubTabsTrigger value="games">Games</SubTabsTrigger>
                <SubTabsTrigger value="people">People</SubTabsTrigger>
              </SubTabsList>
            </Tabs>

            <div className="mt-3">
              {adminSection === 'games' && (
                adminGames.length === 0 ? (
                  <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
                    No games yet.
                  </p>
                ) : (
                  <ListGroup>
                    {adminGames.map((g) => (
                      <ListRow
                        key={g.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/games/${g.id}`)}
                        title={g.name}
                        subtitle={
                          <span className="flex items-center gap-1.5">
                            {new Date(g.scheduled_for).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                            <Badge variant={g.status === 'live' ? 'win' : 'muted'} className="text-[12px]">
                              {g.status}
                            </Badge>
                          </span>
                        }
                        trailing={
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteGame(g.id) }}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-error/10 hover:text-error"
                            aria-label="Delete game"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        }
                      />
                    ))}
                  </ListGroup>
                )
              )}

              {adminSection === 'people' && (
                adminRows.length === 0 ? (
                  <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
                    No profiles yet.
                  </p>
                ) : (
                  <>
                    {adminRows.some((r) => r.role === 'host') && (
                      <>
                        <h3 className="type-label-caption mb-2 text-muted">Hosts</h3>
                        <ListGroup>
                          {adminRows.filter((r) => r.role === 'host').map((r) => (
                            <ListRow
                              key={r.id}
                              avatar={<NamedAvatar name={r.full_name ?? '—'} />}
                              title={r.full_name ?? '—'}
                              subtitle={
                                <span className="flex items-center gap-1.5">
                                  <Badge variant={r.approved ? 'win' : 'muted'} className="text-[12px]">
                                    {r.approved ? 'Approved' : 'Pending'}
                                  </Badge>
                                </span>
                              }
                              trailing={
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant={r.approved ? 'destructive' : 'default'}
                                    className="h-7 px-2.5 text-xs"
                                    onClick={() => (r.approved ? removeHost(r.id) : makeHost(r.id))}
                                  >
                                    {r.approved ? 'Revoke' : 'Approve'}
                                  </Button>
                                  <button
                                    onClick={() => deleteProfile(r.id)}
                                    className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-error/10 hover:text-error"
                                    aria-label="Delete profile"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              }
                            />
                          ))}
                        </ListGroup>
                      </>
                    )}

                    <h3 className={`type-label-caption mb-2 text-muted ${adminRows.some((r) => r.role === 'host') ? 'mt-5' : ''}`}>Players</h3>
                    <ListGroup>
                      {adminRows.filter((r) => r.role === 'player').map((r) => (
                        <ListRow
                          key={r.id}
                          avatar={<NamedAvatar name={r.full_name ?? '—'} />}
                          title={r.full_name ?? '—'}
                          trailing={
                            <div className="flex items-center gap-1">
                              <Button
                                variant="default"
                                className="h-7 px-2.5 text-xs"
                                onClick={() => makeHost(r.id)}
                              >
                                Make host
                              </Button>
                              <button
                                onClick={() => deleteProfile(r.id)}
                                className="flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-error/10 hover:text-error"
                                aria-label="Delete profile"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          }
                        />
                      ))}
                    </ListGroup>
                  </>
                )
              )}
            </div>
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
