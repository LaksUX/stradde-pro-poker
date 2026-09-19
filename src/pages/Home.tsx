import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { toChips } from '../lib/chips'
import { Button } from '../components/ui/Button'
import { PageSpinner, InlineSpinner } from '../components/ui/Spinner'
import { StatCard } from '../components/ui/StatCard'
import { SegmentedControl } from '../components/ui/SegmentedControl'

type HostedGame = { id: string; name: string; closed_at: string | null; pot: number; rake: number }
type PlayedGame = { id: string; name: string; closed_at: string | null; net: number; chip_ratio: '1:1' | '1:2' }

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

  useEffect(() => {
    if (!profile) return
    let cancelled = false

    async function loadHostTab() {
      if (profile!.role !== 'host' || !profile!.approved) return
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

    setLoadingData(true)
    Promise.all([loadHostTab(), loadPlayerTab()]).then(() => {
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

  const isApprovedHost = profile?.role === 'host' && profile.approved
  const lifetimeNet = playedGames.reduce((s, g) => s + toChips(g.net, g.chip_ratio), 0)
  const wins = playedGames.filter((g) => g.net > 0).length
  const totalRake = hostedGames.reduce((s, g) => s + g.rake, 0)
  const avgPot = hostedGames.length
    ? Math.round(hostedGames.reduce((s, g) => s + g.pot, 0) / hostedGames.length)
    : 0

  return (
    <div className="mx-auto max-w-sm p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">
          Hey{profile?.full_name ? ` ${profile.full_name}` : ''}
        </h1>
        <button className="text-xs text-muted underline" onClick={handleLogout}>
          Log out
        </button>
      </div>

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

      <div className="mt-5">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'player', label: 'Player' },
            ...(isApprovedHost ? [{ value: 'host' as const, label: 'Host' }] : []),
          ]}
        />
      </div>

      {loadingData && <InlineSpinner />}

      {!loadingData && tab === 'player' && (
        <div className="mt-4">
          <StatCard
            eyebrow="Lifetime net"
            value={`${lifetimeNet} chips`}
            valueClassName={lifetimeNet >= 0 ? 'text-win' : 'text-error'}
          >
            <p className="mt-3 border-t border-hairline-soft pt-3 text-xs text-muted">
              {wins} win{wins === 1 ? '' : 's'} · {playedGames.length} game
              {playedGames.length === 1 ? '' : 's'} played
            </p>
          </StatCard>
          <Link to="/my-settlements" className="mt-3 block text-center text-sm text-primary underline">
            My settlements
          </Link>
          <div className="mt-4 rounded-lg border border-hairline bg-canvas">
            {playedGames.length === 0 && (
              <p className="p-4 text-center text-sm text-muted">No closed games yet.</p>
            )}
            {playedGames.map((g) => (
              <Link
                key={g.id}
                to={`/games/${g.id}`}
                className="flex items-center justify-between border-b border-hairline-soft p-3 text-sm last:border-none"
              >
                <span className="text-ink">{g.name}</span>
                <span className={`font-mono tabular-nums ${g.net >= 0 ? 'text-win' : 'text-error'}`}>
                  {toChips(g.net, g.chip_ratio)} chips
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {!loadingData && tab === 'host' && isApprovedHost && (
        <div className="mt-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-hairline bg-canvas p-3 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Games hosted</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-ink">{hostedGames.length}</p>
            </div>
            <div className="rounded-lg border border-hairline bg-canvas p-3 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Rake collected</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-ink">{totalRake} banks</p>
            </div>
            <div className="col-span-2 rounded-lg border border-hairline bg-canvas p-3 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Average pot</p>
              <p className="mt-1 font-mono text-lg font-bold tabular-nums text-ink">{avgPot} banks</p>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-hairline bg-canvas">
            {hostedGames.length === 0 && (
              <p className="p-4 text-center text-sm text-muted">No closed games yet.</p>
            )}
            {hostedGames.map((g) => (
              <Link
                key={g.id}
                to={`/games/${g.id}`}
                className="flex items-center justify-between border-b border-hairline-soft p-3 text-sm last:border-none"
              >
                <span className="text-ink">{g.name}</span>
                <span className="font-mono tabular-nums text-muted">{g.pot} banks pot</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
