import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { toChips, type ChipRatio } from '../lib/chips'
import { toast } from '../lib/toast'
import { PageSpinner, InlineSpinner } from '../components/ui/Spinner'

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
        <h1 className="text-lg font-semibold text-ink">{game.name}</h1>
        <p className="mt-2 text-muted">
          Starts {new Date(game.scheduled_for).toLocaleString()} — hasn't started yet.
        </p>
      </div>
    )
  }
  if (game.status === 'closed') {
    return (
      <div className="mx-auto max-w-sm p-6">
        <div className="rounded-md border border-hairline p-4">
          <h1 className="text-lg font-semibold text-ink">{game.name}</h1>
          <p className="text-sm text-muted">{game.venue_freetext}</p>
        </div>
        {myTransfer === 'unresolved' && <InlineSpinner />}
        {myTransfer === 'none' && (
          <p className="mt-4 text-center text-sm text-muted">
            No settlement here for you — either it hasn't been published yet, you weren't in
            this game, or there's nothing you owe or are owed.
          </p>
        )}
        {myTransfer && myTransfer !== 'none' && myTransfer !== 'unresolved' && (
          <div className="mt-4 rounded-md border border-hairline p-4">
            <p className="text-ink">
              <span className="capitalize">{myTransfer.from_name}</span>{' '}
              {myTransfer.from_name === 'you' ? 'owe' : 'owes'}{' '}
              <span className="capitalize">{myTransfer.to_name}</span>
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-primary">
              {toChips(myTransfer.amount, closedGameRatio)} chips
              <span className="ml-2 text-sm font-normal text-muted">({myTransfer.amount} banks)</span>
            </p>
            <span
              className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                myTransfer.status === 'confirmed'
                  ? 'bg-green-50 text-win'
                  : myTransfer.status === 'disputed'
                    ? 'bg-red-50 text-error'
                    : 'bg-surface-strong text-muted'
              }`}
            >
              {myTransfer.status}
            </span>
          </div>
        )}
      </div>
    )
  }

  const seated = roster.length
  const full = game.table_status_override
    ? game.table_status_override === 'full'
    : seated >= game.table_size
  const ratio: ChipRatio = '1:1' // not exposed pre-join — see Join.tsx's comment

  return (
    <div className="mx-auto max-w-sm p-6">
      {displayMode && (
        <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-muted">
          Table display
        </p>
      )}
      <div className="mx-auto mb-4 w-fit rounded-sm border-4 border-canvas p-1 shadow-elevated">
        <QRCodeSVG value={`${window.location.origin}/t/${gameId}`} size={120} />
      </div>
      {!displayMode && (
        <button
          onClick={() => {
            navigator.clipboard.writeText(`${window.location.origin}/t/${gameId}`)
            toast.success('Link copied')
          }}
          className="mx-auto mb-4 block text-center text-xs text-primary underline"
        >
          Copy link
        </button>
      )}
      <div className="rounded-md border border-hairline p-4">
        <h1 className="text-lg font-semibold text-ink">{game.name}</h1>
        <p className="text-sm text-muted">{game.venue_freetext}</p>
        <p className="text-sm text-muted">
          {game.stake} banks buy-in ({toChips(game.stake, ratio)} chips)
        </p>
        <span
          className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            full ? 'bg-red-50 text-error' : 'bg-green-50 text-win'
          }`}
        >
          {full ? 'Table full' : 'Seats open'} · {seated}/{game.table_size}
        </span>
      </div>

      {!displayMode && myStatus === 'not-joined' && (
        <>
          <button
            onClick={() => navigate(`/join/${gameId}`)}
            className="mt-4 h-12 w-full rounded-sm bg-primary text-[16px] font-medium text-on-primary hover:bg-primary-active"
          >
            {full ? 'Request a seat anyway' : 'Join this game'}
          </button>
          <button
            onClick={() => navigate(`/t/${gameId}?display=1`, { replace: true })}
            className="mt-2 w-full text-center text-xs text-muted underline"
          >
            Put this device on table display
          </button>
        </>
      )}

      {!displayMode && myStatus === 'pending' && (
        <div className="mt-4 rounded-md border border-hairline p-4 text-center">
          <p className="text-sm text-ink">
            Your request for {myPendingCount} buy-in{myPendingCount === 1 ? '' : 's'} is waiting
            on the host.
          </p>
          <p className="mt-1 text-xs text-muted">This page updates on its own once confirmed.</p>
        </div>
      )}

      {!displayMode && myStatus === 'confirmed' && (
        <button
          onClick={() =>
            navigate(
              myProfileId === game.host_id ? `/games/${gameId}/live` : `/games/${gameId}/my-game`
            )
          }
          className="mt-4 h-12 w-full rounded-sm bg-primary text-[16px] font-medium text-on-primary hover:bg-primary-active"
        >
          {myProfileId === game.host_id ? 'Go to Live Game' : 'Go to my game'}
        </button>
      )}

      {myStatus === 'confirmed' && roster.length > 0 && (
        <div className="mt-5 rounded-md border border-hairline">
          <p className="border-b border-hairline-soft p-3 text-center text-xs text-muted">
            Names only, ranked by buy-ins — no totals, no one else's numbers.
          </p>
          {roster.map((r) => (
            <div
              key={r.profile_id}
              className="flex items-center justify-between border-b border-hairline-soft px-3 py-2.5 text-sm last:border-none"
            >
              <span className="font-semibold text-ink">
                {r.full_name}
                {r.profile_id === myProfileId ? ' (you)' : ''}
              </span>
              {r.profile_id === myProfileId && (
                <span className="text-lg font-bold tabular-nums text-ink">{r.buyin_count}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
