import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { toChips, type ChipRatio } from '../lib/chips'
import { toast } from '../lib/toast'
import { PageSpinner, InlineSpinner } from '../components/ui/Spinner'
import { Button } from '../components/ui/Button'
import { InviteQrCard } from '../components/ui/InviteQrCard'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Table, TableBody, TableCell, TableRow } from '../components/ui/table'
import { NamedAvatar } from '../components/ui/avatar'

type GameSummary = {
  id: string
  name: string
  venue_freetext: string | null
  scheduled_for: string
  status: 'scheduled' | 'live' | 'closed'
  stake: number
  table_size: number
  table_status_override: 'full' | 'open' | null
  host_id: string
}
type RosterRow = { profile_id: string; full_name: string; buyin_count: number }
type MyTransfer = {
  id: string
  from_player_id: string
  to_player_id: string
  from_name: string
  to_name: string
  amount: number
  status: 'pending' | 'confirmed' | 'disputed'
}

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
  const [myTransfer, setMyTransfer] = useState<MyTransfer | null | 'none' | 'unresolved'>(
    'unresolved'
  )
  const [myStatus, setMyStatus] = useState<'unknown' | 'not-joined' | 'pending' | 'confirmed'>(
    'unknown'
  )
  const [myPendingCount, setMyPendingCount] = useState<number | null>(null)
  const [myProfileId, setMyProfileId] = useState<string | null>(null)
  // public_game_summary deliberately doesn't expose chip_ratio pre-join
  // (see 0002_rls_policies.sql's view comment) — but a closed-game viewer
  // is always a confirmed game_players row by this point, so RLS already
  // lets them read the real games row directly. Using that instead of
  // hardcoding 1:1 here matters for correctness: a 1:2 game's settlement
  // was rendering at half its real chip value.
  const [closedGameRatio, setClosedGameRatio] = useState<ChipRatio>('1:1')

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
    async function loadMyStatus() {
      const { data: session } = await supabase.auth.getSession()
      const userId = session.session?.user?.id
      if (!userId) {
        setMyStatus('not-joined')
        return
      }
      setMyProfileId(userId)
      const { data: confirmedRow } = await supabase
        .from('game_players')
        .select('id')
        .eq('game_id', gameId)
        .eq('profile_id', userId)
        .maybeSingle()
      if (confirmedRow) {
        setMyStatus('confirmed')
        return
      }
      const { data: pendingRow } = await supabase
        .from('buyin_requests')
        .select('count')
        .eq('game_id', gameId)
        .eq('profile_id', userId)
        .eq('status', 'pending')
        .maybeSingle()
      if (pendingRow) {
        setMyStatus('pending')
        setMyPendingCount(pendingRow.count)
        return
      }
      setMyStatus('not-joined')
    }
    loadGame()
    loadRoster()
    loadMyStatus()

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
        () => {
          loadRoster()
          loadMyStatus()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
        () => {
          loadRoster()
          loadMyStatus()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId])

  useEffect(() => {
    if (!gameId || game?.status !== 'closed') return
    let cancelled = false
    async function loadMyTransfer() {
      const { data: session } = await supabase.auth.getSession()
      const userId = session.session?.user?.id
      if (!userId) {
        if (!cancelled) setMyTransfer('none')
        return
      }
      const { data: myPlayer } = await supabase
        .from('game_players')
        .select('id')
        .eq('game_id', gameId)
        .eq('profile_id', userId)
        .maybeSingle()
      if (!myPlayer) {
        if (!cancelled) setMyTransfer('none')
        return
      }
      const { data: g } = await supabase
        .from('games')
        .select('chip_ratio')
        .eq('id', gameId)
        .maybeSingle()
      if (g && !cancelled) setClosedGameRatio(g.chip_ratio as ChipRatio)
      const { data: t } = await supabase
        .from('settlement_transfers')
        .select('id, from_player_id, to_player_id, amount, status')
        .eq('game_id', gameId)
        .or(`from_player_id.eq.${myPlayer.id},to_player_id.eq.${myPlayer.id}`)
        .maybeSingle()
      if (!t) {
        if (!cancelled) setMyTransfer('none')
        return
      }
      const otherPlayerId = t.from_player_id === myPlayer.id ? t.to_player_id : t.from_player_id
      const { data: otherPlayer } = await supabase
        .from('game_players')
        .select('id, profiles(full_name)')
        .eq('id', otherPlayerId)
        .maybeSingle()
      const otherName = (otherPlayer as any)?.profiles?.full_name ?? '—'
      if (!cancelled) {
        setMyTransfer({
          id: t.id,
          from_player_id: t.from_player_id,
          to_player_id: t.to_player_id,
          from_name: t.from_player_id === myPlayer.id ? 'you' : otherName,
          to_name: t.to_player_id === myPlayer.id ? 'you' : otherName,
          amount: t.amount,
          status: t.status,
        })
      }
    }
    loadMyTransfer()
    return () => {
      cancelled = true
    }
  }, [gameId, game?.status])

  if (!game) return <PageSpinner />

  if (game.status === 'scheduled') {
    return (
      <div className="mx-auto max-w-sm p-6 text-center">
        <h1 className="type-page-title text-ink">{game.name}</h1>
        <p className="type-body-md mt-2 text-body">
          Starts {new Date(game.scheduled_for).toLocaleString()} — hasn't started yet.
        </p>
      </div>
    )
  }
  if (game.status === 'closed') {
    return (
      <div className="mx-auto max-w-sm p-6">
        <Card>
          <CardContent>
            <h1 className="type-page-title text-ink">{game.name}</h1>
            <p className="text-sm text-muted">{game.venue_freetext}</p>
          </CardContent>
        </Card>
        {myTransfer === 'unresolved' && <InlineSpinner />}
        {myTransfer === 'none' && (
          <p className="mt-4 text-center text-sm text-muted">
            No settlement here for you — either it hasn't been published yet, you weren't in
            this game, or there's nothing you owe or are owed.
          </p>
        )}
        {myTransfer && myTransfer !== 'none' && myTransfer !== 'unresolved' && (
          <Card className="mt-4">
            <CardContent>
              <p className="text-ink">
                <span className="capitalize">{myTransfer.from_name}</span>{' '}
                {myTransfer.from_name === 'you' ? 'owe' : 'owes'}{' '}
                <span className="capitalize">{myTransfer.to_name}</span>
              </p>
              <div className="mt-1 flex items-center gap-2">
                <p className="type-figure-hero text-ink">
                  {toChips(myTransfer.amount, closedGameRatio)} chips
                </p>
                <Badge
                  variant={
                    myTransfer.status === 'confirmed'
                      ? 'win'
                      : myTransfer.status === 'disputed'
                        ? 'error'
                        : 'muted'
                  }
                >
                  {myTransfer.status}
                </Badge>
              </div>
              <p className="text-sm text-muted">({myTransfer.amount} banks)</p>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  const seated = roster.length
  const full = game.table_status_override
    ? game.table_status_override === 'full'
    : seated >= game.table_size
  const ratio: ChipRatio = '1:1' // not exposed pre-join — see Join.tsx's comment
  // A fresh visitor deciding whether to join needs the QR/link front and
  // center — it's the entire content of their decision. Someone already
  // seated cares about their own status and the roster first; showing the
  // same big QR to them pushed that below the fold for no reason, so it
  // collapses for anyone past "not-joined" (table-display mode is the one
  // exception — its whole job is being a static invite screen).
  const showQrByDefault = displayMode || myStatus === 'not-joined'

  return (
    <div className="mx-auto max-w-sm p-6">
      {displayMode && (
        <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-muted">
          Table display
        </p>
      )}
      {showQrByDefault ? (
        <div className="mb-4">
          <InviteQrCard
            eyebrow={full ? 'Table full' : 'Seats open'}
            title={game.name}
            subtitle={game.venue_freetext ?? undefined}
            url={`${window.location.origin}/t/${gameId}`}
            size={140}
          />
        </div>
      ) : (
        <button
          onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/t/${gameId}`)
            toast.success('Link copied')
          }}
          className="mb-4 block text-center text-xs text-primary underline"
        >
          Copy invite link
        </button>
      )}
      <Card>
        <CardContent>
          <h1 className="type-page-title text-ink">{game.name}</h1>
          <p className="text-sm text-muted">{game.venue_freetext}</p>
          <p className="text-sm text-muted">
            {game.stake} banks buy-in ({toChips(game.stake, ratio)} chips)
          </p>
          <Badge variant={full ? 'error' : 'win'} className="mt-2">
            {full ? 'Table full' : 'Seats open'} · {seated}/{game.table_size}
          </Badge>
        </CardContent>
      </Card>

      {!displayMode && myStatus === 'not-joined' && (
        <>
          <Button block className="mt-4" onClick={() => navigate(`/join/${gameId}`)}>
            {full ? 'Request a seat anyway' : 'Join this game'}
          </Button>
          <button
            onClick={() => navigate(`/t/${gameId}?display=1`, { replace: true })}
            className="mt-2 w-full text-center text-xs text-muted underline"
          >
            Put this device on table display
          </button>
        </>
      )}

      {!displayMode && myStatus === 'pending' && (
        <Card className="mt-4 text-center">
          <CardContent>
            <p className="text-sm text-ink">
              Your request for {myPendingCount} buy-in{myPendingCount === 1 ? '' : 's'} is waiting
              on the host.
            </p>
            <p className="mt-1 text-xs text-muted">This page updates on its own once confirmed.</p>
          </CardContent>
        </Card>
      )}

      {!displayMode && myStatus === 'confirmed' && (
        <Button
          block
          className="mt-4"
          onClick={() =>
            navigate(
              myProfileId === game.host_id ? `/games/${gameId}/live` : `/games/${gameId}/my-game`
            )
          }
        >
          {myProfileId === game.host_id ? 'Go to Live Game' : 'Go to my game'}
        </Button>
      )}

      {myStatus === 'confirmed' && roster.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-center text-xs text-muted">
            Names only, ranked by buy-ins — no totals, no one else's numbers.
          </p>
          <Table>
            <TableBody>
              {roster.map((r) => (
                <TableRow key={r.profile_id}>
                  <TableCell className="font-semibold text-ink">
                    <div className="flex items-center gap-2">
                      <NamedAvatar name={r.full_name} />
                      <span>
                        {r.full_name}
                        {r.profile_id === myProfileId ? ' (you)' : ''}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.profile_id === myProfileId && (
                      <span className="type-figure-md text-ink">{r.buyin_count}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
