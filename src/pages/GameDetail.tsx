import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { toChips, type ChipRatio } from '../lib/chips'
import { PageSpinner } from '../components/ui/Spinner'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Badge } from '../components/ui/badge'

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
      <h1 className="type-page-title text-ink">{game.name}</h1>
      {game.venue_id ? (
        <Link to={`/venues/${game.venue_id}`} className="text-sm text-primary underline">
          {game.venue_freetext}
        </Link>
      ) : (
        <p className="text-sm text-muted">{game.venue_freetext}</p>
      )}

      {isHost ? (
        <>
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Net</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {players.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{p.full_name}</TableCell>
                  <TableCell className="text-right">
                    <p className="text-xs text-muted">{p.buyins} buy-ins</p>
                    {p.cashout == null ? (
                      <p className="type-figure-md text-muted">in play</p>
                    ) : (
                      <p
                        className={`type-figure-md ${
                          p.cashout - p.buyins * game.stake >= 0 ? 'text-win' : 'text-error'
                        }`}
                      >
                        {toChips(p.cashout - p.buyins * game.stake, ratio)} chips
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {transfers.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Settlement</CardTitle>
              </CardHeader>
              <CardContent className="gap-0">
                {transfers.map((t, i) => (
                  <div key={i} className="flex items-center justify-between py-1 text-sm">
                    <span className="text-ink">
                      {t.from} → {t.to}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="type-figure-md text-ink">{toChips(t.amount, ratio)} chips</span>
                      <Badge variant={t.status === 'confirmed' ? 'win' : t.status === 'disputed' ? 'error' : 'muted'}>
                        {t.status}
                      </Badge>
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      ) : me ? (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Your net</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <p className="type-figure-hero text-ink">
                {me.cashout == null ? 'In play' : `${toChips(me.cashout - me.buyins * game.stake, ratio)} chips`}
              </p>
              {me.cashout != null && (
                <Badge variant={me.cashout - me.buyins * game.stake >= 0 ? 'win' : 'error'}>
                  {me.cashout - me.buyins * game.stake >= 0 ? 'Winning' : 'Down'}
                </Badge>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">{me.buyins} buy-in{me.buyins === 1 ? '' : 's'}</p>
          </CardContent>
        </Card>
      ) : (
        <p className="mt-4 text-center text-sm text-muted">You weren't in this game.</p>
      )}
    </div>
  )
}
