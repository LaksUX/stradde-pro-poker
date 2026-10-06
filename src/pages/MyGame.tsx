import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatChips, fromChips, toChips, type ChipRatio } from '../lib/chips'
import { runWrite } from '../lib/errors'
import { toast } from '../lib/toast'
import { Button } from '../components/ui/button'
import { PageSpinner } from '../components/ui/spinner'
import { ListGroup, ListRow } from '../components/ui/list-row'
import { Item, ItemContent, ItemDescription, ItemTitle } from '../components/ui/item'
import { NamedAvatar } from '../components/ui/avatar'
import { Badge } from '../components/ui/badge'
import { ChipsFigure } from '../components/ui/chips-figure'
import { SettlementRow } from '../components/ui/settlement-row'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { LineChart } from '../components/ui/line-chart'
import { X, ChevronDown } from 'lucide-react'

const MAX_REQUEST = 100
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
  cashout_requested: number | null
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
type OtherPlayer = { profile_id: string; full_name: string }
type MyTransferRow = {
  id: string
  direction: 'owe' | 'owed'
  otherName: string
  amount: number
  status: 'pending' | 'confirmed' | 'disputed'
}
const LOCK_MS = 60_000

// See PAGE_PROMPTS.md "My Game" — a signed-in player's own game view, the
// same page whether the game is still live or already closed (it used to
// bounce a player over to Game Detail on close — that split is gone, this
// page now just adapts its own content instead). Never shows another
// player's numbers beyond their name — same pattern as ShareTable/LiveGame
// for query + realtime, scoped down to "own rows only" throughout.
export function MyGame() {
  const { gameId } = useParams()
  const { session, profile, loading } = useAuth()
  const [game, setGame] = useState<Game | null>(null)
  const [myPlayer, setMyPlayer] = useState<MyPlayer | null>(null)
  const [requests, setRequests] = useState<Request[]>([])
  const [otherPlayers, setOtherPlayers] = useState<OtherPlayer[]>([])
  const [myTransfers, setMyTransfers] = useState<MyTransferRow[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerMode, setPickerMode] = useState<'buyin' | 'cashout'>('buyin')
  const [count, setCount] = useState(1)
  const [cashoutAmount, setCashoutAmount] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [activityExpanded, setActivityExpanded] = useState(false)

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
        .select('id, cashout, cashout_confirm_status, cashout_requested')
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
    // Same source regardless of status (game_roster_names, 0019 migration)
    // — names only, no buy-in/cash-out/net, so this never leaks another
    // player's numbers.
    async function loadOtherPlayers() {
      const { data } = await supabase
        .from('game_roster_names')
        .select('profile_id, full_name')
        .eq('game_id', gameId)
        .neq('profile_id', profile!.id)
      setOtherPlayers((data ?? []) as OtherPlayer[])
    }
    // Reused from Game Detail's non-host branch — moved here now that this
    // page covers the closed state too, so Game Detail no longer needs its
    // own copy of this query.
    async function loadMyTransfers() {
      const { data: g } = await supabase.from('games').select('status').eq('id', gameId).maybeSingle()
      if (g?.status !== 'closed') return
      const { data: mp } = await supabase
        .from('game_players')
        .select('id')
        .eq('game_id', gameId)
        .eq('profile_id', profile!.id)
        .maybeSingle()
      if (!mp) return
      const { data: ts } = await supabase
        .from('settlement_transfers')
        .select('id, from_player_id, to_player_id, amount, status')
        .eq('game_id', gameId)
        .or(`from_player_id.eq.${mp.id},to_player_id.eq.${mp.id}`)
      const results: MyTransferRow[] = []
      for (const t of ts ?? []) {
        const direction: 'owe' | 'owed' = t.from_player_id === mp.id ? 'owe' : 'owed'
        const otherId = t.from_player_id === mp.id ? t.to_player_id : t.from_player_id
        const { data: other } = await supabase
          .from('game_players')
          .select('profiles(full_name)')
          .eq('id', otherId)
          .maybeSingle()
        results.push({
          id: t.id,
          direction,
          otherName: (other as any)?.profiles?.full_name ?? '—',
          amount: t.amount,
          status: t.status,
        })
      }
      setMyTransfers(results)
    }
    loadGame()
    loadMyPlayer()
    loadRequests()
    loadOtherPlayers()
    loadMyTransfers()

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
        () => {
          loadMyPlayer()
          loadOtherPlayers()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        () => {
          loadGame()
          loadMyTransfers()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'settlement_transfers', filter: `game_id=eq.${gameId}` },
        loadMyTransfers
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
  // While still playing, the one thing worth interrupting the player for is
  // an outstanding request — everything else in the activity feed is just
  // history. Surfaced right under the hero instead of buried at the bottom
  // of a list they'd have to scroll to.
  const pendingRequest = requests.find((r) => r.status === 'pending')

  // Cumulative confirmed buy-ins over time, in chips — the running total at
  // each confirmation, not a per-event delta, since "trend" here means
  // "how the pile grew," same shape as Home's lifetime-net chart.
  const confirmedSorted = requests
    .filter((r) => r.status === 'confirmed' && r.confirmed_at)
    .sort((a, b) => a.confirmed_at!.localeCompare(b.confirmed_at!))
  const trendPoints = confirmedSorted
    .reduce<number[]>((totals, r) => {
      totals.push((totals.at(-1) ?? 0) + r.count)
      return totals
    }, [])
    .map((totalCount) => toChips(totalCount * game.stake, ratio))
  const latestRequest = requests[0] ?? null

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

  // Proposes a cash-out — the host still has the final say, same trust
  // model as everything else here. Writes cashout_requested, never cashout
  // itself; 0019_player_cashout_request.sql's trigger would silently drop
  // the write anyway if this ever tried to touch cashout directly.
  async function requestCashout() {
    if (!myPlayer || cashoutAmount <= 0) return
    setSubmitting(true)
    const ok = await runWrite(
      () => supabase.from('game_players').update({ cashout_requested: fromChips(cashoutAmount, ratio) }).eq('id', myPlayer.id),
      'Requesting cash-out'
    )
    setSubmitting(false)
    if (!ok) return
    setPickerOpen(false)
    setCashoutAmount(0)
    toast.success('Cash-out requested — waiting on the host.')
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

      <div className="mt-4 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          {netBanks == null ? 'Total buy-ins' : 'Your result'}
        </p>
        <p className="mt-1 flex items-baseline justify-center gap-1.5">
          <ChipsFigure
            amount={netBanks == null ? confirmedBuyins * game.stake : netBanks}
            ratio={ratio}
            size="hero"
            tone={netBanks == null ? 'neutral' : netBanks >= 0 ? 'win' : 'error'}
          />
          <Badge variant={netBanks == null || netBanks >= 0 ? 'win' : 'error'}>
            {netBanks == null ? 'Playing' : netBanks >= 0 ? 'Winning' : 'Down'}
          </Badge>
        </p>

        {netBanks == null ? (
          <p className="mt-2 text-xs text-muted">
            {confirmedBuyins} confirmed buy-in{confirmedBuyins === 1 ? '' : 's'}
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-hairline bg-canvas px-2 py-2.5 text-center">
              <p className="text-[12.5px] text-muted">Buy-ins</p>
              <p className="mt-0.5">
                <ChipsFigure amount={confirmedBuyins * game.stake} ratio={ratio} />
              </p>
            </div>
            <div className="rounded-lg border border-hairline bg-canvas px-2 py-2.5 text-center">
              <p className="text-[12.5px] text-muted">Cash-out</p>
              <p className="mt-0.5">
                <ChipsFigure amount={myPlayer.cashout!} ratio={ratio} />
              </p>
            </div>
          </div>
        )}

        {myPlayer.cashout != null && (
          <div className="mt-3 border-t border-hairline-soft pt-3 text-left">
            <p className="text-xs text-muted">
              Cashed out for {formatChips(myPlayer.cashout, ratio)}
              {myPlayer.cashout_confirm_status ? ` — ${myPlayer.cashout_confirm_status}` : ''}
            </p>
            {!myPlayer.cashout_confirm_status && (
              <div className="mt-2 flex gap-2">
                <Button
                  variant="default"
                  className="h-8 px-3 text-xs"
                  onClick={() => setCashoutConfirm('confirmed')}
                >
                  Confirm
                </Button>
                <Button
                  variant="destructive"
                  className="h-8 px-3 text-xs"
                  onClick={() => setCashoutConfirm('disputed')}
                >
                  Doesn't look right
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {myPlayer.cashout == null && pendingRequest && (
        <Item variant="outline" className="mt-3 items-start border-primary/40 bg-canvas">
          <ItemContent>
            <ItemTitle className="text-sm font-normal">
              Requested {pendingRequest.count} buy-in{pendingRequest.count > 1 ? 's' : ''} — waiting on
              the host.
            </ItemTitle>
            <ItemDescription className="text-xs">This page updates on its own once confirmed.</ItemDescription>
          </ItemContent>
        </Item>
      )}

      {myPlayer.cashout == null && myPlayer.cashout_requested != null && (
        <Item variant="outline" className="mt-3 items-start border-primary/40 bg-canvas">
          <ItemContent>
            <ItemTitle className="text-sm font-normal">
              Requested a cash-out of {formatChips(myPlayer.cashout_requested, ratio)} — waiting on the host.
            </ItemTitle>
            <ItemDescription className="text-xs">This page updates on its own once confirmed.</ItemDescription>
          </ItemContent>
        </Item>
      )}

      {myPlayer.cashout == null && !pendingRequest && (
        <Button variant="secondary" block className="mt-3" onClick={() => setPickerOpen(true)}>
          Request buy-ins or cash out
        </Button>
      )}

      <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
        <SheetContent>
          <SheetHeader>
            <span className="relative shrink-0">
              <NamedAvatar name={profile?.full_name ?? '?'} className="h-12 w-12" />
              <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-canvas bg-win" />
            </span>
            <SheetTitle>Request buy-ins or cash out</SheetTitle>
          </SheetHeader>

          <Tabs value={pickerMode} onValueChange={(v) => setPickerMode(v as 'buyin' | 'cashout')} className="mt-4">
            <TabsList>
              <TabsTrigger value="buyin">Buy-ins</TabsTrigger>
              <TabsTrigger value="cashout">Cash out</TabsTrigger>
            </TabsList>

            <TabsContent value="buyin" className="mt-4">
              <div className="rounded-lg bg-surface-strong px-4 py-3">
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

              <Button
                block
                className="mt-5 rounded-full"
                disabled={submitting || count < 1}
                onClick={requestMore}
              >
                {submitting ? 'Sending…' : `Request ${count} buy-in${count === 1 ? '' : 's'}`}
              </Button>
              <p className="mt-2 text-center text-xs text-muted">
                Sent to the host to confirm — you'll have {confirmedBuyins + count} total once approved.
              </p>
            </TabsContent>

            <TabsContent value="cashout" className="mt-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cashout-amount">Cash-out amount · 1 buy-in = {formatChips(1, ratio)}</Label>
                <Input
                  id="cashout-amount"
                  type="number"
                  inputMode="numeric"
                  className="h-14 text-lg"
                  value={cashoutAmount || ''}
                  onChange={(e) => setCashoutAmount(Math.max(0, Number(e.target.value) || 0))}
                />
                <p className="text-xs text-muted">
                  The host still confirms the final amount.
                </p>
              </div>

              <Button
                block
                className="mt-5 rounded-full"
                disabled={submitting || cashoutAmount <= 0}
                onClick={requestCashout}
              >
                {submitting ? 'Sending…' : 'Request cash-out'}
              </Button>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {myTransfers.length > 0 && (
        <div className="mt-5">
          <h2 className="type-label-caption mb-2 text-muted">Settlement</h2>
          <ListGroup>
            {myTransfers.map((t) => (
              <SettlementRow
                key={t.id}
                otherName={t.otherName}
                direction={t.direction}
                amount={t.amount}
                ratio={ratio}
                status={t.status}
              />
            ))}
          </ListGroup>
        </div>
      )}

      {trendPoints.length > 0 && (
        <div className="mt-5">
          <h2 className="type-label-caption mb-2 text-muted">Buy-in trend</h2>
          <LineChart
            points={trendPoints}
            labels={confirmedSorted.map((r) =>
              new Date(r.confirmed_at!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
            )}
            height={150}
          />
        </div>
      )}

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <h2 className="type-label-caption text-muted">Your activity</h2>
          {requests.length > 1 && (
            <button
              type="button"
              className="flex items-center gap-0.5 text-xs text-muted hover:text-ink"
              onClick={() => setActivityExpanded((v) => !v)}
            >
              {activityExpanded ? 'Show less' : `See all ${requests.length}`}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${activityExpanded ? 'rotate-180' : ''}`}
              />
            </button>
          )}
        </div>
        {requests.length === 0 ? (
          <p className="mt-2 rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
            Nothing yet.
          </p>
        ) : (
          <ListGroup className="mt-2">
            {(activityExpanded ? requests : latestRequest ? [latestRequest] : []).map((r) => {
              const locked =
                r.status === 'confirmed' &&
                r.confirmed_at &&
                Date.now() - new Date(r.confirmed_at).getTime() > LOCK_MS
              return (
                <div key={r.id}>
                  <ListRow
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
                        variant="default"
                        className="h-8 px-3 text-xs"
                        onClick={() => setBuyinConfirm(r.id, 'confirmed')}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="destructive"
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

      {otherPlayers.length > 0 && (
        <div className="mt-5">
          <h2 className="type-label-caption mb-2 text-muted">Other players</h2>
          <ListGroup>
            {otherPlayers.map((p) => (
              <ListRow
                key={p.profile_id}
                avatar={<NamedAvatar name={p.full_name} className="h-10 w-10" />}
                title={p.full_name}
              />
            ))}
          </ListGroup>
        </div>
      )}
    </div>
  )
}
