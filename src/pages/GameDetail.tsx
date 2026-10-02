import { useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { toChips, type ChipRatio } from '../lib/chips'
import { PageSpinner } from '../components/ui/Spinner'
import { ListGroup, ListRow } from '../components/ui/list-row'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/Button'
import { NamedAvatar } from '../components/ui/avatar'
import { ChipsFigure } from '../components/ui/chips-figure'
import { LineChart } from '../components/ui/line-chart'
import { ArrowRight } from 'lucide-react'

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
type VenueOther = { profile_id: string; full_name: string }

// See PAGE_PROMPTS.md "Game Detail" — now the HOST's own view only. A
// player's equivalent (buy-ins/cash-out/net, settlement, the same venue
// section below) lives at My Game instead, for both a live and a closed
// game — see that page's own header comment. Redirects a non-host there
// rather than rendering anything, so an old bookmark or shared link still
// lands somewhere useful.
export function GameDetail() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [transfers, setTransfers] = useState<
    { from: string; to: string; amount: number; status: string }[]
  >([])
  const [venueTrend, setVenueTrend] = useState<number[]>([])
  const [venueOthers, setVenueOthers] = useState<VenueOther[]>([])

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

      // Replaces the old standalone Venue Detail page — a trimmed version
      // of it (buy-ins trend, other players by name only, no pot/rake
      // averages or a second games list) lives below this game's own
      // content instead. venue_game_rows/venue_regulars (0006 migration)
      // only have rows for a matched venue_id, same gap the old page had
      // for a venue_freetext-only game.
      if (g?.venue_id) {
        const [{ data: trendRows }, { data: regularRows }] = await Promise.all([
          supabase
            .from('venue_game_rows')
            .select('closed_at, stake, chip_ratio, confirmed_buyin_units')
            .eq('venue_id', g.venue_id)
            .order('closed_at', { ascending: true }),
          supabase
            .from('venue_regulars')
            .select('profile_id, full_name')
            .eq('venue_id', g.venue_id)
            .neq('profile_id', profile!.id),
        ])
        setVenueTrend(
          (trendRows ?? []).map((r) => toChips(r.confirmed_buyin_units * r.stake, r.chip_ratio as ChipRatio))
        )
        setVenueOthers((regularRows ?? []) as VenueOther[])
      }
    }
    load()
  }, [gameId, profile])

  if (!game || !profile) return <PageSpinner />
  if (game.host_id !== profile.id) return <Navigate to={`/games/${gameId}/my-game`} replace />
  const ratio = game.chip_ratio

  return (
    <div className="mx-auto w-full max-w-sm p-4 sm:p-6">
      <h1 className="type-page-title text-ink">{game.name}</h1>
      {game.venue_freetext && <p className="text-sm text-muted">{game.venue_freetext}</p>}

      <ListGroup className="mt-4">
        {players.map((p) => (
          <ListRow
            key={p.id}
            avatar={<NamedAvatar name={p.full_name} className="h-12 w-12" />}
            title={p.full_name}
            subtitle={`${p.buyins} buy-in${p.buyins === 1 ? '' : 's'}`}
            trailing={
              p.cashout == null ? (
                <span className="type-figure-md text-muted">In play</span>
              ) : (
                <ChipsFigure
                  amount={p.cashout - p.buyins * game.stake}
                  ratio={ratio}
                  tone={p.cashout - p.buyins * game.stake >= 0 ? 'win' : 'error'}
                />
              )
            }
          />
        ))}
      </ListGroup>
      {transfers.length > 0 && (
        <>
          <h2 className="type-label-caption mb-2 mt-5 text-muted">Settlement</h2>
          <ListGroup>
            {transfers.map((t, i) => (
              <ListRow
                key={i}
                avatar={
                  <div className="flex items-center">
                    <NamedAvatar name={t.from} className="h-10 w-10 border-2 border-canvas" />
                    <NamedAvatar name={t.to} className="-ml-3 h-10 w-10 border-2 border-canvas" />
                  </div>
                }
                title={
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span>{t.from}</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <span>{t.to}</span>
                  </span>
                }
                trailing={
                  <>
                    <ChipsFigure amount={t.amount} ratio={ratio} />
                    <Badge
                      variant={t.status === 'confirmed' ? 'win' : t.status === 'disputed' ? 'error' : 'muted'}
                    >
                      {t.status}
                    </Badge>
                  </>
                }
              />
            ))}
          </ListGroup>
        </>
      )}
      {game.status === 'closed' && (
        <Button variant="secondary" block className="mt-5" onClick={() => navigate(`/games/${gameId}/live`)}>
          Adjust buy-ins, cash-outs, or rake
        </Button>
      )}

      {game.venue_id && (
        <>
          <h2 className="type-label-caption mb-2 mt-5 text-muted">Buy-ins trend at this venue</h2>
          {venueTrend.length > 0 ? (
            <LineChart points={venueTrend} height={60} />
          ) : (
            <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
              Not enough games yet.
            </p>
          )}

          {venueOthers.length > 0 && (
            <>
              <h2 className="type-label-caption mb-2 mt-5 text-muted">Other players here</h2>
              <ListGroup>
                {venueOthers.map((p) => (
                  <ListRow
                    key={p.profile_id}
                    avatar={<NamedAvatar name={p.full_name} className="h-10 w-10" />}
                    title={p.full_name}
                  />
                ))}
              </ListGroup>
            </>
          )}
        </>
      )}
    </div>
  )
}
