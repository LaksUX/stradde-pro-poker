import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { toChips, type ChipRatio } from '../lib/chips'
import { runWrite } from '../lib/errors'
import { toast } from '../lib/toast'
import { BuyinPicker } from '../components/ui/BuyinPicker'
import { Button } from '../components/ui/Button'
import { PageSpinner } from '../components/ui/Spinner'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { ListGroup, ListRow } from '../components/ui/list-row'
import { Avatar, AvatarFallback } from '../components/ui/avatar'
import { Badge } from '../components/ui/badge'
import { Plus } from 'lucide-react'

type Game = {
  id: string
  name: string
  stake: number
  chip_ratio: ChipRatio
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
        .select('id, name, stake, chip_ratio')
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

  if (loading) return <PageSpinner />
  if (!session) return <Navigate to="/continue" replace />
  if (!game || !myPlayer) return <PageSpinner />

  const ratio = game.chip_ratio
  const confirmedBuyins = requests
    .filter((r) => r.status === 'confirmed')
    .reduce((s, r) => s + r.count, 0)
  const netBanks = myPlayer.cashout == null ? null : myPlayer.cashout - confirmedBuyins * game.stake

  async function requestMore() {
    if (!gameId || !profile || !myPlayer) return
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
          <CardTitle>Your net</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <p className="type-figure-hero text-ink">
              {netBanks == null ? 'In play' : `${toChips(netBanks, ratio)} chips`}
            </p>
            {netBanks != null && (
              <Badge variant={netBanks >= 0 ? 'win' : 'error'}>
                {netBanks >= 0 ? 'Winning' : 'Down'}
              </Badge>
            )}
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
                  <button
                    className="text-xs text-primary underline"
                    onClick={() => setCashoutConfirm('confirmed')}
                  >
                    Confirm
                  </button>
                  <button
                    className="text-xs text-error underline"
                    onClick={() => setCashoutConfirm('disputed')}
                  >
                    Doesn't look right
                  </button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {myPlayer.cashout == null && (
        <div className="mt-3">
          {!pickerOpen ? (
            <Button variant="secondary" block onClick={() => setPickerOpen(true)}>
              Request more buy-ins
            </Button>
          ) : (
            <div className="rounded-lg border border-hairline bg-canvas p-3">
              <BuyinPicker value={count} onChange={setCount} />
              <div className="flex gap-2">
                <Button block disabled={submitting} onClick={requestMore}>
                  Send request
                </Button>
                <Button variant="ghost" onClick={() => setPickerOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

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
                      <button
                        className="text-xs text-primary underline"
                        onClick={() => setBuyinConfirm(r.id, 'confirmed')}
                      >
                        Confirm
                      </button>
                      <button
                        className="text-xs text-error underline"
                        onClick={() => setBuyinConfirm(r.id, 'disputed')}
                      >
                        Doesn't look right
                      </button>
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

      <Link to={`/t/${gameId}`} className="mt-4 block text-center text-xs text-primary underline">
        View shared table
      </Link>
    </div>
  )
}
