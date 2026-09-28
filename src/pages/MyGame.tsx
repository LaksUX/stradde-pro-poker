import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { toChips, type ChipRatio } from '../lib/chips'
import { runWrite } from '../lib/errors'
import { toast } from '../lib/toast'
import { Button } from '../components/ui/Button'
import { PageSpinner } from '../components/ui/Spinner'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { ListGroup, ListRow } from '../components/ui/list-row'
import { Avatar, AvatarFallback, NamedAvatar } from '../components/ui/avatar'
import { Badge } from '../components/ui/badge'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Plus, X } from 'lucide-react'

const MAX_REQUEST = 30
const QUICK_ADD = [1, 2, 3, 5]

type Game = {
  id: string
  name: string
  stake: number
  chip_ratio: ChipRatio
  status: 'scheduled' | 'live' | 'closed'
}
type MyPlayer = {
  id: string
  cashout: number | null
  cashout_confirm_status: 'confirmed' | 'disputed' | null
}
type Request = {
  id: string
  request_type: 'join' | 'more_buyins'
  count: number
  status: 'pending' | 'confirmed' | 'declined'
  player_confirm_status: 'confirmed' | 'disputed' | null
  requested_at: string
  confirmed_at: string | null
}
const LOCK_MS = 60_000

// See PAGE_PROMPTS.md "My Game" — a signed-in player's own live view: a
// timestamped feed of their own entries, confirm/dispute per entry, and
// "Request more buy-ins" without leaving the screen. Never shows another
// player's numbers — same pattern as ShareTable/LiveGame for query +
// realtime, scoped down to "own rows only" throughout.
export function MyGame() {
  const { gameId } = useParams()
  const { session, profile, loading } = useAuth()
  const [game, setGame] = useState<Game | null>(null)
  const [myPlayer, setMyPlayer] = useState<MyPlayer | null>(null)
  const [requests, setRequests] = useState<Request[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [count, setCount] = useState(1)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!gameId || !profile) return

    async function loadGame() {
      const { data } = await supabase
        .from('games')
        .select('id, name, stake, chip_ratio, status')
        .eq('id', gameId)
        .maybeSingle()
      setGame(data as Game | null)
    }
    async function loadMyPlayer() {
      const { data } = await supabase
        .from('game_players')
        .select('id, cashout, cashout_confirm_status')
        .eq('game_id', gameId)
        .eq('profile_id', profile!.id)
        .maybeSingle()
      setMyPlayer(data as MyPlayer | null)
    }
    async function loadRequests() {
      const { data } = await supabase
        .from('buyin_requests')
        .select('id, request_type, count, status, player_confirm_status, requested_at, confirmed_at')
        .eq('game_id', gameId)
        .eq('profile_id', profile!.id)
        .order('requested_at', { ascending: false })
      setRequests((data ?? []) as Request[])
    }
    loadGame()
    loadMyPlayer()
    loadRequests()

    const channel = supabase
      .channel(`my-game-${gameId}-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'buyin_requests', filter: `game_id=eq.${gameId}` },
        loadRequests
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
        loadMyPlayer
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        loadGame
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId, profile])

  // The host closing the game while a player is sitting on this exact
  // screen used to leave them stuck on "Playing" forever — nothing here
  // ever looked at game.status. This is the natural next screen: same
  // redirect-on-status-change pattern ShareTable already uses for
  // scheduled → live, just for live → closed instead.
  if (session && game?.status === 'closed') return <Navigate to={`/games/${gameId}`} replace />

  if (loading) return <PageSpinner />
  if (!session) return <Navigate to="/continue" replace />
  if (!game || !myPlayer) return <PageSpinner />

  const ratio = game.chip_ratio
  const confirmedBuyins = requests
    .filter((r) => r.status === 'confirmed')
    .reduce((s, r) => s + r.count, 0)
  const netBanks = myPlayer.cashout == null ? null : myPlayer.cashout - confirmedBuyins * game.stake
  // While still playing, the one thing worth interrupting the player for is
  // an outstanding request — everything else in the activity feed is just
  // history. Surfaced right under the hero instead of buried at the bottom
  // of a list they'd have to scroll to.
  const pendingRequest = requests.find((r) => r.status === 'pending')

  async function requestMore() {
    if (!gameId || !profile || !myPlayer || count < 1) return
    setSubmitting(true)
    try {
      const { error } = await supabase.from('buyin_requests').insert({
        game_id: gameId,
        profile_id: profile.id,
        requester_name: profile.full_name ?? '—',
        game_player_id: myPlayer.id,
        request_type: 'more_buyins',
        count,
      })
      if (error) throw error
      setPickerOpen(false)
      setCount(1)
      toast.success('Request sent — waiting on the host.')
    } catch (e) {
      toast.error(
        e instanceof Error && navigator.onLine
          ? e.message
          : "Request didn't send — you're offline. Reconnect and try again."
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function setBuyinConfirm(reqId: string, status: 'confirmed' | 'disputed') {
    await runWrite(
      () => supabase.from('buyin_requests').update({ player_confirm_status: status }).eq('id', reqId),
      status === 'confirmed' ? 'Confirming' : 'Flagging'
    )
  }

  async function setCashoutConfirm(status: 'confirmed' | 'disputed') {
    if (!myPlayer) return
    await runWrite(
      () =>
        supabase.from('game_players').update({ cashout_confirm_status: status }).eq('id', myPlayer.id),
      status === 'confirmed' ? 'Confirming cash-out' : 'Flagging cash-out'
    )
  }

  return (
    <div className="mx-auto w-full max-w-sm p-4 sm:p-6">
      <h1 className="type-page-title text-ink">{game.name}</h1>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>{netBanks == null ? 'Total buy-ins' : 'Your net'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <p className="flex items-baseline gap-1.5 text-ink">
              <span className="type-figure-hero">
                {netBanks == null ? toChips(confirmedBuyins * game.stake, ratio) : toChips(netBanks, ratio)}
              </span>
              <span className="text-sm text-muted">chips</span>
            </p>
            <Badge variant={netBanks == null || netBanks >= 0 ? 'win' : 'error'}>
              {netBanks == null ? 'Playing' : netBanks >= 0 ? 'Winning' : 'Down'}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-muted">
            {confirmedBuyins} confirmed buy-in{confirmedBuyins === 1 ? '' : 's'}
          </p>

          {myPlayer.cashout != null && (
            <div className="mt-3 border-t border-hairline-soft pt-3">
              <p className="text-xs text-muted">
                Cashed out for {myPlayer.cashout} banks
                {myPlayer.cashout_confirm_status ? ` — ${myPlayer.cashout_confirm_status}` : ''}
              </p>
              {!myPlayer.cashout_confirm_status && (
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="primary"
                    className="h-8 px-3 text-xs"
                    onClick={() => setCashoutConfirm('confirmed')}
                  >
                    Confirm
                  </Button>
                  <Button
                    variant="danger"
                    className="h-8 px-3 text-xs"
                    onClick={() => setCashoutConfirm('disputed')}
                  >
                    Doesn't look right
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {myPlayer.cashout == null && pendingRequest && (
        <div className="mt-3 rounded-lg border border-primary/40 bg-canvas p-3">
          <p className="text-sm text-ink">
            Requested {pendingRequest.count} buy-in{pendingRequest.count > 1 ? 's' : ''} — waiting on
            the host.
          </p>
          <p className="mt-1 text-xs text-muted">This page updates on its own once confirmed.</p>
        </div>
      )}

      {myPlayer.cashout == null && !pendingRequest && (
        <Button variant="secondary" block className="mt-3" onClick={() => setPickerOpen(true)}>
          Request more buy-ins
        </Button>
      )}

      <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
        <SheetContent>
          <SheetHeader>
            <span className="relative shrink-0">
              <NamedAvatar name={profile?.full_name ?? '?'} className="h-12 w-12" />
              <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-canvas bg-win" />
            </span>
            <SheetTitle>Request buy-ins</SheetTitle>
          </SheetHeader>

          <div className="mt-5 rounded-lg bg-surface-strong px-4 py-3">
            <p className="text-xs text-muted">Confirmed so far</p>
            <p className="type-figure-hero mt-0.5 text-ink">
              {confirmedBuyins} buy-in{confirmedBuyins === 1 ? '' : 's'}
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <Label htmlFor="buyin-count">Buy-ins to request</Label>
            <div className="relative">
              {/* min=1 keeps a request from ever reaching zero or negative;
                  clamped again on blur since typing can pass through an
                  empty/out-of-range value while the field is being edited. */}
              <Input
                id="buyin-count"
                type="number"
                inputMode="numeric"
                className="h-14 pr-11 text-lg"
                value={count}
                onChange={(e) => setCount(Number(e.target.value) || 0)}
                onBlur={() => setCount((c) => Math.min(MAX_REQUEST, Math.max(1, c)))}
              />
              <button
                type="button"
                aria-label="Reset to 1"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                onClick={() => setCount(1)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex justify-center gap-1.5">
            {QUICK_ADD.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCount((c) => Math.min(MAX_REQUEST, Math.max(1, c) + n))}
                className="rounded-full bg-surface-strong px-3.5 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-strong/70"
              >
                +{n}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCount(MAX_REQUEST)}
            className="mt-2 w-full rounded-full bg-surface-strong py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-strong/70"
          >
            Maximum ({MAX_REQUEST})
          </button>

          <Button block className="mt-5 rounded-full" disabled={submitting || count < 1} onClick={requestMore}>
            {submitting ? 'Sending…' : `Request ${count} buy-in${count === 1 ? '' : 's'}`}
          </Button>
          <p className="mt-2 text-center text-xs text-muted">
            Sent to the host to confirm — you'll have {confirmedBuyins + count} total once approved.
          </p>
        </SheetContent>
      </Sheet>

      <div className="mt-5">
        <h2 className="type-label-caption mb-2 text-muted">Your activity</h2>
        {requests.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
            Nothing yet.
          </p>
        ) : (
          <ListGroup>
            {requests.map((r) => {
              const locked =
                r.status === 'confirmed' &&
                r.confirmed_at &&
                Date.now() - new Date(r.confirmed_at).getTime() > LOCK_MS
              return (
                <div key={r.id}>
                  <ListRow
                    avatar={
                      <Avatar className="h-12 w-12">
                        <AvatarFallback>
                          <Plus className="h-5 w-5" />
                        </AvatarFallback>
                      </Avatar>
                    }
                    title={
                      <>
                        {r.count} buy-in{r.count > 1 ? 's' : ''}
                        {r.request_type === 'more_buyins' ? ' requested' : ' — join request'}
                      </>
                    }
                    subtitle={new Date(r.requested_at).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                    trailing={
                      <Badge
                        variant={
                          r.status === 'confirmed' ? 'win' : r.status === 'declined' ? 'error' : 'muted'
                        }
                      >
                        {r.status}
                      </Badge>
                    }
                  />
                  {r.status === 'confirmed' && !r.player_confirm_status && (
                    <div className="flex gap-2 px-3 pb-3">
                      <Button
                        variant="primary"
                        className="h-8 px-3 text-xs"
                        onClick={() => setBuyinConfirm(r.id, 'confirmed')}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="danger"
                        className="h-8 px-3 text-xs"
                        onClick={() => setBuyinConfirm(r.id, 'disputed')}
                      >
                        Doesn't look right
                      </Button>
                    </div>
                  )}
                  {r.status === 'confirmed' && r.player_confirm_status === 'disputed' && (
                    <p className="px-3 pb-3 text-xs text-error">
                      {locked
                        ? "Flagged for the host — this buy-in is locked, so this is a note, not an edit request."
                        : 'Flagged for the host.'}
                    </p>
                  )}
                </div>
              )
            })}
          </ListGroup>
        )}
      </div>
    </div>
  )
}
