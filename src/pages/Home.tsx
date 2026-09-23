import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth, type Profile } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { toChips } from '../lib/chips'
import { runWrite } from '../lib/errors'
import { type HostingEntity } from '../lib/entities'
import { Button } from '../components/ui/Button'
import { PageSpinner, InlineSpinner } from '../components/ui/Spinner'
import { InviteQrCard } from '../components/ui/InviteQrCard'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { NamedAvatar } from '../components/ui/avatar'

type HostedGame = { id: string; name: string; closed_at: string | null; pot: number; rake: number }
type PlayedGame = { id: string; name: string; closed_at: string | null; net: number; chip_ratio: '1:1' | '1:2' }

// An admin can also act as a host (0009_admin_can_host.sql widens the
// matching RLS insert policies to match) — kept as one helper so every
// place on this screen that gates on "can this profile host" agrees.
function isApprovedHostRole(profile: Profile): boolean {
  return profile.role === 'host' || profile.role === 'admin'
}

// See PAGE_PROMPTS.md "Home". Simplified from the full spec: no net-trend
// chart split by stake yet (that needs a charting approach this pass
// doesn't set up) — everything else (stats, game lists, tab split) is real,
// queried from Supabase, not mocked.
export function Home() {
  const { session, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState<'host' | 'player'>('player')
  const [hostedGames, setHostedGames] = useState<HostedGame[]>([])
  const [playedGames, setPlayedGames] = useState<PlayedGame[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [entity, setEntity] = useState<HostingEntity | null>(null)
  const [entityQrOpen, setEntityQrOpen] = useState(false)
  const [nameEditing, setNameEditing] = useState(false)

  useEffect(() => {
    if (!profile) return
    let cancelled = false

    async function loadHostTab() {
      if (!isApprovedHostRole(profile!) || !profile!.approved) return
      const { data: games } = await supabase
        .from('games')
        .select('id, name, closed_at, rake, stake')
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
        results.push({ id: g.id, name: g.name, closed_at: g.closed_at, pot: totalBuyins, rake: g.rake })
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

    async function loadEntity() {
      if (!isApprovedHostRole(profile!) || !profile!.approved) return
      // Read-only here — the entity is only ever created lazily by
      // getOrCreateOwnEntity, the first time this host actually creates a
      // game (see CreateGame.tsx). A brand-new approved host with no games
      // yet legitimately has none — the card below just doesn't render.
      const { data } = await supabase
        .from('hosting_entities')
        .select('id, name, slug')
        .eq('owner_profile_id', profile!.id)
        .maybeSingle()
      if (!cancelled) setEntity((data as HostingEntity) ?? null)
    }

    setLoadingData(true)
    Promise.all([loadHostTab(), loadPlayerTab(), loadEntity()]).then(() => {
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

  async function renameEntity(name: string) {
    if (!entity || !name.trim()) return
    const ok = await runWrite(
      () => supabase.from('hosting_entities').update({ name: name.trim() }).eq('id', entity.id),
      'Renaming'
    )
    if (ok) setEntity({ ...entity, name: name.trim() })
    setNameEditing(false)
  }

  const isApprovedHost = !!profile && isApprovedHostRole(profile) && profile.approved
  const lifetimeNet = playedGames.reduce((s, g) => s + toChips(g.net, g.chip_ratio), 0)
  const wins = playedGames.filter((g) => g.net > 0).length
  const totalRake = hostedGames.reduce((s, g) => s + g.rake, 0)
  const avgPot = hostedGames.length
    ? Math.round(hostedGames.reduce((s, g) => s + g.pot, 0) / hostedGames.length)
    : 0

  return (
    <div className="mx-auto w-full max-w-sm p-4 sm:p-6">
      <header className="flex items-center justify-between">
        <h1 className="type-page-title text-ink">
          Hey{profile?.full_name ? ` ${profile.full_name}` : ''}
        </h1>
        <button className="text-xs text-muted underline" onClick={handleLogout}>
          Log out
        </button>
      </header>

      {profile?.role === 'admin' && (
        <Link to="/admin" className="mt-2 inline-block text-xs text-primary underline">
          Admin
        </Link>
      )}

      {isApprovedHost ? (
        <Button block className="mt-4" onClick={() => navigate('/games/new')}>
          New game
        </Button>
      ) : profile?.role === 'host' ? (
        <Button variant="ghost" block className="mt-4" onClick={() => navigate('/pending-approval')}>
          Host application pending
        </Button>
      ) : (
        <Button variant="ghost" block className="mt-4" onClick={() => navigate('/apply-to-host')}>
          Apply to host
        </Button>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as 'host' | 'player')} className="mt-5">
        <TabsList>
          <TabsTrigger value="player">Player</TabsTrigger>
          {isApprovedHost && <TabsTrigger value="host">Host</TabsTrigger>}
        </TabsList>

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
                <p className="mt-3 border-t border-hairline-soft pt-3 text-xs text-muted">
                  {wins} win{wins === 1 ? '' : 's'} · {playedGames.length} game
                  {playedGames.length === 1 ? '' : 's'} played
                </p>
              </CardContent>
            </Card>

            <div className="mt-4 flex gap-4">
              <Link to="/my-settlements" className="flex flex-col items-center gap-1.5">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-strong text-primary">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 7h6m-6 4h6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="text-xs text-muted">Settlements</span>
              </Link>
            </div>

            <div className="mt-4">
              {playedGames.length === 0 ? (
                <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
                  No closed games yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Game</TableHead>
                      <TableHead className="w-28 text-right">Net</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {playedGames.map((g) => (
                      <TableRow
                        key={g.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/games/${g.id}`)}
                      >
                        <TableCell>
                          <div className="flex min-w-0 items-center gap-2">
                            <NamedAvatar name={g.name} className="shrink-0" />
                            <span className="truncate">{g.name}</span>
                          </div>
                        </TableCell>
                        <TableCell
                          className={`type-figure-md w-28 whitespace-nowrap text-right ${
                            g.net >= 0 ? 'text-win' : 'text-error'
                          }`}
                        >
                          {toChips(g.net, g.chip_ratio)} chips
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        )}

        {!loadingData && isApprovedHost && (
          <TabsContent value="host" className="mt-4">
            {entity && (
              <Card className="mb-4">
                <CardContent>
                  <div className="flex items-center justify-between">
                    {nameEditing ? (
                      <Input
                        autoFocus
                        defaultValue={entity.name}
                        onBlur={(e) => renameEntity(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renameEntity((e.target as HTMLInputElement).value)
                        }}
                        className="h-8 flex-1"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-ink">{entity.name}</span>
                    )}
                    <button
                      className="ml-2 shrink-0 text-xs text-muted underline"
                      onClick={() => setNameEditing((v) => !v)}
                    >
                      {nameEditing ? 'Done' : 'Rename'}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Your permanent link — always opens whatever game's live right now, never changes
                    night to night.
                  </p>
                  <button
                    className="mt-2 text-xs text-primary underline"
                    onClick={() => setEntityQrOpen((v) => !v)}
                  >
                    {entityQrOpen ? 'Hide' : 'Show QR'}
                  </button>
                  {entityQrOpen && (
                    <div className="mt-3">
                      <InviteQrCard
                        eyebrow="Permanent link"
                        title={entity.name}
                        url={`${window.location.origin}/e/${entity.slug}`}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 gap-2">
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
                  <p className="type-figure-md text-ink">{totalRake} banks</p>
                </CardContent>
              </Card>
              <Card className="col-span-2 text-center">
                <CardHeader>
                  <CardTitle className="mx-auto">Average pot</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="type-figure-md text-ink">{avgPot} banks</p>
                </CardContent>
              </Card>
            </div>

            <div className="mt-4">
              {hostedGames.length === 0 ? (
                <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
                  No closed games yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Game</TableHead>
                      <TableHead className="w-28 text-right">Pot</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hostedGames.map((g) => (
                      <TableRow
                        key={g.id}
                        className="cursor-pointer"
                        onClick={() => navigate(`/games/${g.id}`)}
                      >
                        <TableCell>
                          <div className="flex min-w-0 items-center gap-2">
                            <NamedAvatar name={g.name} className="shrink-0" />
                            <span className="truncate">{g.name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="type-figure-md w-28 whitespace-nowrap text-right text-muted">
                          {g.pot} banks
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
