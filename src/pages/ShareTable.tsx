import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { toChips, type ChipRatio } from '../lib/chips'
import { toast } from '../lib/toast'
import { continueWithPhone } from '../hooks/useAuth'
import { withTimeout } from '../lib/errors'
import { PageSpinner, InlineSpinner } from '../components/ui/Spinner'
import { Button } from '../components/ui/Button'
import { InviteQrCard } from '../components/ui/InviteQrCard'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { ListGroup, ListRow } from '../components/ui/list-row'
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
  join_code: string | null
}
type RosterRow = { profile_id: string; full_name: string; buyin_count: number }
type RsvpRow = { profile_id: string; full_name: string }
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
  const [rsvps, setRsvps] = useState<RsvpRow[]>([])
  const [rsvpName, setRsvpName] = useState('')
  const [rsvpPhone, setRsvpPhone] = useState('')
  const [rsvpSubmitting, setRsvpSubmitting] = useState(false)
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
    async function loadRsvps() {
      const { data } = await supabase
        .from('public_game_rsvps')
        .select('profile_id, full_name')
        .eq('game_id', gameId)
        .order('responded_at', { ascending: true })
      setRsvps((data ?? []) as RsvpRow[])
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
    loadRsvps()

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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_rsvps', filter: `game_id=eq.${gameId}` },
        loadRsvps
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

  // A confirmed player landing on this link (re-scanning the QR, an old
  // bookmark) has their own dedicated screen — this one's real job is the
  // pre-join decision and the table-display kiosk view. Skip straight past
  // it instead of making them tap "Go to my game" on a screen they don't
  // need. Table-display mode is the deliberate exception — a device left on
  // /t/:gameId?display=1 stays there even if it happens to be signed in as
  // a confirmed player, since showing the shared roster is its whole point.
  // Gated on status === 'live' too — the host is a confirmed game_players
  // row (is_host: true) from the moment they create the game, scheduled or
  // not, and without this check they'd get bounced straight to /live before
  // ever seeing this screen's pre-game RSVP list and share code.
  useEffect(() => {
    if (displayMode || myStatus !== 'confirmed' || !myProfileId || !game || !gameId || game.status !== 'live')
      return
    navigate(myProfileId === game.host_id ? `/games/${gameId}/live` : `/games/${gameId}/my-game`, {
      replace: true,
    })
  }, [displayMode, myStatus, myProfileId, game, gameId, navigate])

  async function rsvpGoing() {
    if (!gameId) return
    setRsvpSubmitting(true)
    try {
      let id = myProfileId
      let name = rsvpName.trim()
      if (!id) {
        if (!rsvpName.trim() || !rsvpPhone.trim()) {
          toast.error('Name and phone are both required')
          return
        }
        const profile = await withTimeout(continueWithPhone(rsvpName.trim(), rsvpPhone.trim()))
        id = profile.id
        name = profile.full_name ?? rsvpName.trim()
        setMyProfileId(id)
      }
      const { error } = await supabase
        .from('game_rsvps')
        .insert({ game_id: gameId, profile_id: id, full_name: name })
      if (error) throw error
      toast.success("You're in!")
    } catch (e) {
      toast.error(
        e instanceof Error && navigator.onLine
          ? e.message
          : "Couldn't RSVP — you're offline. Reconnect and try again."
      )
    } finally {
      setRsvpSubmitting(false)
    }
  }

  async function rsvpCancel() {
    if (!gameId || !myProfileId) return
    const { error } = await supabase
      .from('game_rsvps')
      .delete()
      .eq('game_id', gameId)
      .eq('profile_id', myProfileId)
    if (error) toast.error(navigator.onLine ? error.message : "You're offline. Reconnect and try again.")
  }

  if (!game) return <PageSpinner />

  if (game.status === 'scheduled') {
    const isHost = myProfileId === game.host_id
    const iAmGoing = myProfileId != null && rsvps.some((r) => r.profile_id === myProfileId)
    return (
      <div className="mx-auto w-full max-w-sm p-4 sm:p-6">
        <div className="text-center">
          <h1 className="type-page-title text-ink">{game.name}</h1>
          <p className="type-body-md mt-2 text-body">
            Starts {new Date(game.scheduled_for).toLocaleString()} — hasn't started yet.
          </p>
        </div>

        {isHost && (
          <div className="mt-4">
            <InviteQrCard
              eyebrow="Starts"
              title={new Date(game.scheduled_for).toLocaleString()}
              subtitle={game.venue_freetext ?? undefined}
              url={`${window.location.origin}/t/${gameId}`}
            />
            {game.join_code && (
              <p className="mt-2 text-center text-sm text-muted">
                Or share the code:{' '}
                <span className="font-mono text-lg font-bold tracking-[0.2em] text-ink">
                  {game.join_code}
                </span>
              </p>
            )}
          </div>
        )}

        <div className="mt-5 border-t border-hairline-soft pt-4">
          <h2 className="type-label-caption mb-2 text-muted">Who's in ({rsvps.length})</h2>
          {rsvps.length === 0 ? (
            <p className="text-sm text-muted">No one yet — be the first.</p>
          ) : (
            <ListGroup>
              {rsvps.map((r) => (
                <ListRow
                  key={r.profile_id}
                  avatar={<NamedAvatar name={r.full_name} className="h-10 w-10" />}
                  title={r.profile_id === myProfileId ? `${r.full_name} (you)` : r.full_name}
                />
              ))}
            </ListGroup>
          )}

          {!isHost &&
            (iAmGoing ? (
              <Button variant="secondary" block className="mt-3" onClick={rsvpCancel}>
                Can't make it anymore
              </Button>
            ) : (
              <div className="mt-3">
                {!myProfileId && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="rsvp-name">Name</Label>
                      <Input
                        id="rsvp-name"
                        className="h-12"
                        value={rsvpName}
                        onChange={(e) => setRsvpName(e.target.value)}
                      />
                    </div>
                    <div className="mt-2 flex flex-col gap-1.5">
                      <Label htmlFor="rsvp-phone">Phone</Label>
                      <Input
                        id="rsvp-phone"
                        type="tel"
                        className="h-12"
                        value={rsvpPhone}
                        onChange={(e) => setRsvpPhone(e.target.value)}
                      />
                    </div>
                  </>
                )}
                <Button block className="mt-3" disabled={rsvpSubmitting} onClick={rsvpGoing}>
                  {rsvpSubmitting ? 'Saving…' : "I'm in"}
                </Button>
              </div>
            ))}
        </div>
      </div>
    )
  }
  if (game.status === 'closed') {
    return (
      <div className="mx-auto w-full max-w-sm p-4 sm:p-6">
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
    <div className="mx-auto w-full max-w-sm p-4 sm:p-6">
      {displayMode && (
        <p className="mb-3 text-center text-xs font-medium uppercase tracking-wide text-muted">
          Table display
        </p>
      )}
      {showQrByDefault && (
        <div className="mb-4">
          <InviteQrCard
            eyebrow={full ? 'Table full' : 'Seats open'}
            title={game.name}
            subtitle={game.venue_freetext ?? undefined}
            url={`${window.location.origin}/t/${gameId}`}
            size={140}
          />
          {game.join_code && (
            <p className="mt-2 text-center text-sm text-muted">
              Or share the code:{' '}
              <span className="font-mono text-lg font-bold tracking-[0.2em] text-ink">
                {game.join_code}
              </span>
            </p>
          )}
        </div>
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
          <ListGroup>
            {roster.map((r) => (
              <ListRow
                key={r.profile_id}
                avatar={<NamedAvatar name={r.full_name} className="h-12 w-12" />}
                title={
                  <>
                    {r.full_name}
                    {r.profile_id === myProfileId ? ' (you)' : ''}
                  </>
                }
                trailing={
                  r.profile_id === myProfileId ? (
                    <span className="type-figure-md text-ink">{r.buyin_count}</span>
                  ) : undefined
                }
              />
            ))}
          </ListGroup>
        </div>
      )}
    </div>
  )
}
