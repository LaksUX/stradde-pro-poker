import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatChips, type ChipRatio } from '../lib/chips'
import { runWrite } from '../lib/errors'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/confirmDialog'
import { Button } from '../components/ui/button'
import { PageSpinner } from '../components/ui/spinner'
import { InviteQrCard } from '../components/ui/invite-qr-card'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { ListGroup, ListRow, ListDate } from '../components/ui/list-row'
import { Badge } from '../components/ui/badge'
import { NamedAvatar } from '../components/ui/avatar'
import { ChipsFigure } from '../components/ui/chips-figure'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet'
import { InvitePlayersSheet } from '../components/ui/invite-players-sheet'
import { PlayerCardsSheet } from '../components/ui/player-cards-sheet'
import { ManagersSheet } from '../components/ui/managers-sheet'
import { Slider } from '../components/ui/slider'
import { Switch } from '../components/ui/switch'
import { QrCode, UserPlus, ArrowUp, ArrowDown, ChevronDown, Shield, IdCard } from 'lucide-react'

const MAX_BUYINS = 100

// Approximate on purpose: rounded to the nearest 5 minutes.
function formatGameTime(ms: number) {
  const mins = Math.max(5, Math.round(ms / 300000) * 5)
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
}
const QUICK_ADD = [1, 2, 3, 5]

type Game = {
  id: string
  name: string
  stake: number
  chip_ratio: ChipRatio
  rake: number
  host_id: string
  status: 'scheduled' | 'live' | 'closed'
  scheduled_for: string
  closed_at: string | null
}
type PendingRequest = {
  id: string
  requester_name: string
  request_type: 'join' | 'more_buyins'
  count: number
  requested_at: string
}
type PlayerRow = {
  id: string
  profile_id: string
  is_host: boolean
  cashout: number | null
  cashout_confirm_status: 'confirmed' | 'disputed' | null
  cashout_requested: number | null
  full_name: string
  confirmed_buyins: number
}
type HistoryEntry = {
  id: string
  count: number
  confirmedAt: string
}

// See PAGE_PROMPTS.md "Live Game". This pass wires the core loop that
// matters most to get right end to end: the Pending requests queue and
// confirm/decline — everything else on this screen (the full bottom sheet,
// rake reveal editing, cash-out keypad, Replace shortcut) follows the same
// query/mutation/realtime pattern and is the natural next slice to build.
export function LiveGame() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [game, setGame] = useState<Game | null>(null)
  const [pending, setPending] = useState<PendingRequest[]>([])
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [rakeOpen, setRakeOpen] = useState(false)
  const [rakeValue, setRakeValue] = useState('')
  const [savingRake, setSavingRake] = useState(false)
  const [closing, setClosing] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const [addPlayersOpen, setAddPlayersOpen] = useState(false)
  const [sheetPlayerId, setSheetPlayerId] = useState<string | null>(null)
  const [cardsOpen, setCardsOpen] = useState(false)
  const [managersOpen, setManagersOpen] = useState(false)
  // Lets writes refresh the player list right away instead of waiting on the
  // realtime echo (which can lag or drop), so totals update the moment you save.
  const reloadPlayersRef = useRef<(() => Promise<void>) | null>(null)
  const [sliderValue, setSliderValue] = useState(0)
  const [cashoutOn, setCashoutOn] = useState(false)
  const [cashoutValue, setCashoutValue] = useState('')
  const [savingSheet, setSavingSheet] = useState(false)
  const [historyByPlayer, setHistoryByPlayer] = useState<Map<string, HistoryEntry[]>>(new Map())
  const [historyOpen, setHistoryOpen] = useState(false)
  const [managerIds, setManagerIds] = useState<Set<string>>(new Set())

  const sheetPlayer = players.find((p) => p.id === sheetPlayerId) ?? null
  const sheetDelta = sheetPlayer ? sliderValue - sheetPlayer.confirmed_buyins : 0

  function openPlayerSheet(p: PlayerRow) {
    setSheetPlayerId(p.id)
    setSliderValue(p.confirmed_buyins)
    // A player's own cash-out request pre-fills this the moment the host
    // opens the sheet — they still have to tap save to make it real, same
    // as typing it in themselves, but it saves re-keying a number the
    // player already sent.
    const hasRequest = p.cashout == null && p.cashout_requested != null
    setCashoutOn(p.cashout != null || hasRequest)
    setCashoutValue(p.cashout != null ? String(p.cashout) : hasRequest ? String(p.cashout_requested) : '')
    setHistoryOpen(false)
  }

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!gameId) return

    async function loadGame() {
      const { data } = await supabase.from('games').select('*').eq('id', gameId).single()
      setGame(data as Game)
    }
    async function loadPending() {
      const { data } = await supabase
        .from('buyin_requests')
        .select('id, requester_name, request_type, count, requested_at')
        .eq('game_id', gameId)
        .eq('status', 'pending')
        .order('requested_at', { ascending: true })
      setPending((data ?? []) as PendingRequest[])
    }
    async function loadPlayers() {
      // Two queries kept separate and joined client-side for clarity — a
      // single view (like public_live_roster, but host-scoped with cashout
      // included) is the natural next refactor once this is proven correct.
      const { data: rows } = await supabase
        .from('game_players')
        .select(
          'id, profile_id, is_host, cashout, cashout_confirm_status, cashout_requested, profiles(full_name)'
        )
        .eq('game_id', gameId)
      const { data: reqs } = await supabase
        .from('buyin_requests')
        .select('id, game_player_id, count, confirmed_at')
        .eq('game_id', gameId)
        .eq('status', 'confirmed')
        .order('confirmed_at', { ascending: true })

      const counts = new Map<string, number>()
      const history = new Map<string, HistoryEntry[]>()
      for (const r of reqs ?? []) {
        if (!r.game_player_id) continue
        counts.set(r.game_player_id, (counts.get(r.game_player_id) ?? 0) + r.count)
        const list = history.get(r.game_player_id) ?? []
        list.push({ id: r.id, count: r.count, confirmedAt: r.confirmed_at })
        history.set(r.game_player_id, list)
      }
      // Rows come out oldest-first from the query (needed for the running
      // counts above) — reverse per-player for newest-first display.
      for (const list of history.values()) list.reverse()
      setHistoryByPlayer(history)
      setPlayers(
        (rows ?? []).map((row: any) => ({
          id: row.id,
          profile_id: row.profile_id,
          is_host: row.is_host,
          // Number() so sums add instead of concatenating if numeric arrives as text.
          cashout: row.cashout == null ? null : Number(row.cashout),
          cashout_confirm_status: row.cashout_confirm_status,
          cashout_requested: row.cashout_requested == null ? null : Number(row.cashout_requested),
          full_name: row.profiles?.full_name ?? '—',
          confirmed_buyins: counts.get(row.id) ?? 0,
        }))
      )
    }

    async function loadManagers() {
      const { data } = await supabase
        .from('game_managers')
        .select('profile_id')
        .eq('game_id', gameId)
      setManagerIds(new Set((data ?? []).map((r: any) => r.profile_id)))
    }

    reloadPlayersRef.current = loadPlayers
    loadGame()
    loadPending()
    loadPlayers()
    loadManagers()

    const channel = supabase
      .channel(`live-game-${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'buyin_requests', filter: `game_id=eq.${gameId}` },
        () => {
          loadPending()
          loadPlayers()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
        loadPlayers
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_managers', filter: `game_id=eq.${gameId}` },
        loadManagers
      )
      .subscribe()

    // Safety net for the realtime channel: changes made on ANOTHER phone (a
    // co-host, a second device) can arrive late or not at all, which left the
    // top totals stale. Re-read every few seconds while the screen is visible,
    // and straight away when the app comes back to the foreground.
    function refresh() {
      if (document.visibilityState !== 'visible') return
      loadPending()
      loadPlayers()
      loadGame()
    }
    const poll = setInterval(refresh, 5000)
    document.addEventListener('visibilitychange', refresh)

    return () => {
      clearInterval(poll)
      document.removeEventListener('visibilitychange', refresh)
      supabase.removeChannel(channel)
    }
  }, [gameId])

  async function confirmRequest(req: PendingRequest) {
    if (!gameId) return
    // Confirming a join request also needs a game_players row to exist.
    // Fetch the request's profile_id first (not selected above to keep the
    // pending list query light) — a Postgres function wrapping this in one
    // transaction is the right next step; this two-step client version is
    // fine for the "prove the pattern" scope of this pass.
    let fullReq: { profile_id: string; request_type: 'join' | 'more_buyins' } | null = null
    try {
      const { data, error } = await supabase
        .from('buyin_requests')
        .select('profile_id, request_type')
        .eq('id', req.id)
        .single()
      if (error) throw error
      fullReq = data
    } catch {
      toast.error(
        navigator.onLine
          ? "Couldn't load that request — try again."
          : "Couldn't load that request — you're offline. Reconnect and try again."
      )
      return
    }
    if (!fullReq) return

    let gamePlayerId: string | null = null
    if (fullReq.request_type === 'join') {
      try {
        const { data: gp, error: gpError } = await supabase
          .from('game_players')
          .insert({ game_id: gameId, profile_id: fullReq.profile_id })
          .select('id')
          .single()
        if (gpError) throw gpError
        gamePlayerId = gp.id
      } catch (e) {
        toast.error(e instanceof Error && navigator.onLine ? e.message : "Couldn't confirm — you're offline. Reconnect and try again.")
        return
      }
    } else {
      const { data: existing } = await supabase
        .from('game_players')
        .select('id')
        .eq('game_id', gameId)
        .eq('profile_id', fullReq.profile_id)
        .single()
      gamePlayerId = existing?.id ?? null
    }

    await runWrite(
      () =>
        supabase
          .from('buyin_requests')
          .update({ status: 'confirmed', confirmed_at: new Date().toISOString(), game_player_id: gamePlayerId })
          .eq('id', req.id),
      'Confirming buy-in'
    )
  }

  async function declineRequest(id: string) {
    await runWrite(
      () => supabase.from('buyin_requests').update({ status: 'declined' }).eq('id', id),
      'Declining request'
    )
  }

  // Increasing is a simple new confirmed request. Decreasing (a host
  // correcting a mistake) has no natural single row to "un-confirm" — the
  // schema requires count >= 1, so a negative correction row isn't
  // possible — instead it walks the player's own confirmed requests
  // newest-first, shrinking or deleting them until the total removed
  // matches, same as how a cash register would void the most recent rings
  // first.
  async function applyBuyinChange(p: PlayerRow, newCount: number): Promise<boolean> {
    const delta = newCount - p.confirmed_buyins
    if (delta === 0) return true
    if (delta > 0) {
      return runWrite(
        () =>
          supabase.from('buyin_requests').insert({
            game_id: gameId,
            profile_id: p.profile_id,
            requester_name: p.full_name,
            game_player_id: p.id,
            request_type: 'more_buyins',
            count: delta,
            status: 'confirmed',
            confirmed_at: new Date().toISOString(),
            is_direct_add: true,
          }),
        'Adding buy-ins'
      )
    }
    const { data: reqs } = await supabase
      .from('buyin_requests')
      .select('id, count')
      .eq('game_player_id', p.id)
      .eq('status', 'confirmed')
      .order('confirmed_at', { ascending: false })
    let remaining = -delta
    for (const r of reqs ?? []) {
      if (remaining <= 0) break
      if (r.count <= remaining) {
        const ok = await runWrite(
          () => supabase.from('buyin_requests').delete().eq('id', r.id),
          'Lowering buy-ins'
        )
        if (!ok) return false
        remaining -= r.count
      } else {
        const ok = await runWrite(
          () => supabase.from('buyin_requests').update({ count: r.count - remaining }).eq('id', r.id),
          'Lowering buy-ins'
        )
        if (!ok) return false
        remaining = 0
      }
    }
    return true
  }

  async function saveSheetChanges() {
    if (!sheetPlayer) return
    if (sliderValue < sheetPlayer.confirmed_buyins) {
      const confirmed = await confirmDialog(
        `Lower ${sheetPlayer.full_name}'s buy-ins from ${sheetPlayer.confirmed_buyins} to ${sliderValue}? This removes money already counted as in the table.`,
        { confirmLabel: 'Lower buy-ins', danger: true }
      )
      if (!confirmed) return
    }
    // A cash-out the player already confirmed is theirs to trust — editing
    // it out from under them without a heads-up would let a "fixed" number
    // quietly stop matching what they agreed to. Only fires when the value
    // is actually moving (or being cleared), not on every re-save of an
    // untouched confirmed row.
    const newCashout = cashoutOn ? Number(cashoutValue) || 0 : null
    const cashoutValueChanging = sheetPlayer.cashout != null && newCashout !== sheetPlayer.cashout
    if (cashoutValueChanging && sheetPlayer.cashout_confirm_status === 'confirmed') {
      const confirmed = await confirmDialog(
        `${sheetPlayer.full_name} already confirmed a cash-out of ${sheetPlayer.cashout} banks. Changing it will ask them to confirm the new amount instead.`,
        { confirmLabel: 'Change cash-out' }
      )
      if (!confirmed) return
    }
    setSavingSheet(true)
    try {
      if (sliderValue !== sheetPlayer.confirmed_buyins) {
        const ok = await applyBuyinChange(sheetPlayer, sliderValue)
        if (!ok) return
      }
      if (cashoutOn) {
        const ok = await runWrite(
          () =>
            supabase
              .from('game_players')
              .update({
                cashout: newCashout,
                // Stale confirm status is worse than no status — clear it
                // whenever the number actually moves so the player is
                // asked to confirm again, but leave it alone on a re-save
                // of the same figure.
                cashout_confirm_status: cashoutValueChanging ? null : sheetPlayer.cashout_confirm_status,
                // The request (if any) is resolved the moment a real
                // cashout is set — whether the host used the player's
                // number as-is or typed a different one.
                cashout_requested: null,
              })
              .eq('id', sheetPlayer.id),
          'Cash-out'
        )
        if (!ok) return
      } else if (sheetPlayer.cashout != null || sheetPlayer.cashout_requested != null) {
        const ok = await runWrite(
          () =>
            supabase
              .from('game_players')
              .update({ cashout: null, cashout_confirm_status: null, cashout_requested: null })
              .eq('id', sheetPlayer.id),
          'Clearing cash-out'
        )
        if (!ok) return
      }
      await reloadPlayersRef.current?.()
      setSheetPlayerId(null)
    } finally {
      setSavingSheet(false)
    }
  }

  function openRakeSheet() {
    setRakeValue(String(game?.rake ?? 0))
    setRakeOpen(true)
  }

  async function saveRake() {
    if (!gameId) return
    setSavingRake(true)
    const ok = await runWrite(
      () => supabase.from('games').update({ rake: Math.max(0, Number(rakeValue) || 0) }).eq('id', gameId),
      'Rake'
    )
    setSavingRake(false)
    if (ok) setRakeOpen(false)
  }

  async function closeAndSettle() {
    // Guards against a double-tap (or a slow network prompting a nervous
    // second tap) firing this twice concurrently — without it, a race could
    // insert a second, duplicate set of settlement_transfers rows. Set
    // before the confirm dialog even opens, so a tap while it's already
    // showing can't start a second run.
    if (!gameId || !game || closing) return
    setClosing(true)
    try {
      const totalIn = players.reduce((s, p) => s + p.confirmed_buyins * game.stake, 0)
      const totalOut = players.reduce((s, p) => s + (p.cashout ?? 0), 0)
      const overageBanks = totalOut + game.rake - totalIn
      if (overageBanks > 0) {
        // Used to just say "resolve the overpay" with no numbers, leaving
        // the host to guess how far off they were. Rake is the one number
        // on this screen a host can freely adjust to reconcile a real cash
        // count against what got tracked — showing exactly how much to
        // lower it by (and revealing the field, which starts masked) turns
        // this into something actionable instead of a dead end.
        toast.error(
          `Can't close — cash-outs plus rake are ${overageBanks} banks ` +
            `more than total buy-ins. ` +
            `Lower rake by at least that much, or fix a player's buy-in/cash-out below.`
        )
        openRakeSheet()
        return
      }
      const unfinished = players.filter((p) => p.cashout == null)
      const confirmed = await confirmDialog(
        unfinished.length > 0
          ? `${unfinished.length} player(s) have no cash-out — their buy-ins will count as a loss to the table. Close the game?`
          : 'Close this game?',
        { confirmLabel: 'Close game', danger: unfinished.length > 0 }
      )
      if (!confirmed) return

      // Anyone still "in play" gets cashout = 0 — walked away, house absorbs it,
      // per REQUIREMENTS.md's Game lifecycle. Fail fast on the first write
      // that doesn't save (e.g. connection drops mid-close) rather than
      // computing settlement against a mix of saved and unsaved cash-outs.
      for (const p of unfinished) {
        const ok = await runWrite(
          () => supabase.from('game_players').update({ cashout: 0 }).eq('id', p.id),
          `Closing out ${p.full_name}`
        )
        if (!ok) return
      }

      const ok = await runWrite(
        () =>
          supabase
            .from('games')
            .update({ status: 'closed', closed_at: new Date().toISOString() })
            .eq('id', gameId),
        'Closing the game'
      )
      if (!ok) return

      navigate(`/games/${gameId}`)
    } finally {
      setClosing(false)
    }
  }

  const isOriginalHost = game?.host_id === profile?.id

  async function toggleManager(profileId: string) {
    if (!gameId) return
    if (managerIds.has(profileId)) {
      await runWrite(
        () => supabase.from('game_managers').delete().eq('game_id', gameId).eq('profile_id', profileId),
        'Removing manager'
      )
    } else {
      await runWrite(
        () => supabase.from('game_managers').insert({ game_id: gameId, profile_id: profileId }),
        'Adding manager'
      )
    }
  }

  if (!game) return <PageSpinner />
  if (!profile) return <div className="p-6 text-center text-muted">Sign in required.</div>

  const startMs = new Date(game.scheduled_for).getTime()
  const endMs = game.closed_at ? new Date(game.closed_at).getTime() : now
  const timeLine =
    game.status === 'scheduled' || Number.isNaN(startMs) || startMs > now
      ? null
      : `Game time ~${formatGameTime(endMs - startMs)}`

  const ratio = game.chip_ratio
  // Grouped, not interleaved — the whole point of splitting these into two
  // tables with their own headers is so "who's still playing" and "who's
  // done" each read as one clear list, instead of a host having to check
  // every row's tiny status marker one at a time.
  const activePlayers = players.filter((p) => p.cashout == null)
  const cashedOutPlayers = players.filter((p) => p.cashout != null)
  const requestedBanks = players
    .filter((p) => p.cashout == null && p.cashout_requested != null)
    .reduce((sum, p) => sum + (p.cashout_requested ?? 0), 0)
  const totalBuyinCount = players.reduce((s, p) => s + p.confirmed_buyins, 0)

  return (
    <div className="mx-auto w-full max-w-md p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="type-page-title text-ink">{game.name}</h1>
          {timeLine && <p className="mt-0.5 text-xs text-muted">{timeLine}</p>}
        </div>
        {gameId && (
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-hairline text-muted hover:bg-surface-strong hover:text-ink"
              onClick={() => setCardsOpen(true)}
              aria-label="Player cards"
            >
              <IdCard className="h-[18px] w-[18px]" />
            </button>
            {game.host_id === profile?.id && (
              <>
                <button
                  type="button"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-hairline text-muted hover:bg-surface-strong hover:text-ink"
                  onClick={() => setManagersOpen(true)}
                  aria-label="Co-hosts"
                >
                  <Shield className="h-[18px] w-[18px]" />
                </button>
                <ManagersSheet
                  open={managersOpen}
                  onOpenChange={setManagersOpen}
                  gameId={gameId}
                  gameName={game.name}
                  closed={game.status === 'closed'}
                />
              </>
            )}
            <PlayerCardsSheet
              open={cardsOpen}
              onOpenChange={setCardsOpen}
              gameId={gameId}
              players={players.map((p) => ({ profile_id: p.profile_id, full_name: p.full_name }))}
            />
          </div>
        )}
        {gameId && game.status !== 'closed' && (
          <div className="ml-2 flex shrink-0 gap-2">
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-hairline text-muted hover:bg-surface-strong hover:text-ink"
              onClick={() => setAddPlayersOpen(true)}
              aria-label="Add players you've played with before"
            >
              <UserPlus className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-hairline text-muted hover:bg-surface-strong hover:text-ink"
              onClick={() => setQrOpen(true)}
              aria-label="Invite via QR"
            >
              <QrCode className="h-[18px] w-[18px]" />
            </button>
            <Sheet open={qrOpen} onOpenChange={setQrOpen}>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Invite walk-ins</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <InviteQrCard eyebrow="Live table" title={game.name} url={`${window.location.origin}/t/${gameId}`} />
                </div>
              </SheetContent>
            </Sheet>
            <InvitePlayersSheet
              open={addPlayersOpen}
              onOpenChange={setAddPlayersOpen}
              gameId={gameId}
              existingProfileIds={players.map((p) => p.profile_id)}
            />
          </div>
        )}
      </div>

      {/* Pending requests need action now — they lead the screen, ahead of
          the always-there utility cards below (invite, rake), so a host
          opening mid-game sees what's waiting on them first. */}
      {pending.length > 0 && (
        <div className="mt-3">
          <h2 className="type-label-caption mb-2 text-primary">
            Pending requests ({pending.length})
          </h2>
          <ListGroup className="border-primary/40">
            {pending.map((r) => (
              <div key={r.id}>
                <ListRow
                  avatar={<NamedAvatar name={r.requester_name} className="h-12 w-12" />}
                  title={r.requester_name}
                  subtitle={
                    <>
                      {r.count} buy-in{r.count > 1 ? 's' : ''}
                      {r.request_type === 'more_buyins' ? ' · more buy-ins' : ' · join request'}
                    </>
                  }
                  trailing={
                    <span className="whitespace-nowrap text-[12.5px] text-muted">
                      {new Date(r.requested_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  }
                />
                <div className="flex gap-2 px-3 pb-3">
                  <Button variant="default" block className="h-10" onClick={() => confirmRequest(r)}>
                    Confirm
                  </Button>
                  <Button variant="destructive" block className="h-10" onClick={() => declineRequest(r.id)}>
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </ListGroup>
        </div>
      )}

      <Card className="mt-3">
        <CardContent>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="min-w-0">
              <p className="type-label-caption text-muted">Buy-ins</p>
              <p className="mt-1">
                <ChipsFigure
                  amount={players.reduce((s, p) => s + p.confirmed_buyins * game.stake, 0)}
                  ratio={ratio}
                />
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted">
                {totalBuyinCount} buy-in{totalBuyinCount === 1 ? '' : 's'}
              </p>
            </div>
            <div className="min-w-0">
              <p className="type-label-caption text-muted">Cash-out</p>
              <p className="mt-1">
                <ChipsFigure amount={players.reduce((s, p) => s + (p.cashout ?? 0), 0)} ratio={ratio} />
              </p>
              <p className="mt-0.5 text-[12.5px] text-muted">
                {cashedOutPlayers.length} player{cashedOutPlayers.length === 1 ? '' : 's'}
              </p>
              {requestedBanks > 0 && (
                <p className="mt-0.5 text-[12.5px] text-primary">
                  +{formatChips(requestedBanks, ratio)} requested
                </p>
              )}
            </div>
            <button
              type="button"
              className="min-w-0"
              onClick={openRakeSheet}
              aria-label="Edit rake"
            >
              <p className="type-label-caption text-muted">Rake</p>
              <p className="mt-1">
                <span className="type-figure-md tracking-widest text-muted">••••</span>
              </p>
            </button>
          </div>
          {players.length > 0 && (
            <p className="mt-3 border-t border-hairline-soft pt-3 text-center text-xs text-muted">
              {cashedOutPlayers.length} of {players.length} cashed out
            </p>
          )}
        </CardContent>
      </Card>

      <Sheet open={rakeOpen} onOpenChange={setRakeOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Rake</SheetTitle>
          </SheetHeader>
          <p className="mt-1 text-xs text-muted">Only you and managers can see this.</p>

          <div className="mt-4 rounded-lg bg-surface-strong px-4 py-3">
            <p className="text-xs text-muted">Current rake</p>
            <p className="mt-0.5">
              <ChipsFigure amount={game.rake} ratio={ratio} size="hero" />
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <Label htmlFor="rake-amount">Rake (banks)</Label>
            <Input
              id="rake-amount"
              type="number"
              inputMode="numeric"
              className="h-14 text-lg"
              value={rakeValue}
              onChange={(e) => setRakeValue(e.target.value)}
            />
          </div>

          <Button block className="mt-5" disabled={savingRake} onClick={saveRake}>
            {savingRake ? 'Saving…' : 'Save rake'}
          </Button>
        </SheetContent>
      </Sheet>

      <div className="mt-4">
        {players.length === 0 && (
          <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
            No one has joined yet — share the link.
          </p>
        )}

        {activePlayers.length > 0 && (
          <>
            <h2 className="type-label-caption mb-2 text-muted">Playing ({activePlayers.length})</h2>
            <ListGroup>
              {activePlayers.map((p) => (
                <ListRow
                  key={p.id}
                  className="cursor-pointer"
                  onClick={() => openPlayerSheet(p)}
                  avatar={
                    <span className="relative shrink-0">
                      <NamedAvatar name={p.full_name} className="h-12 w-12" />
                      <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-canvas bg-win" />
                    </span>
                  }
                  title={`${p.full_name}${p.is_host ? ' (host)' : managerIds.has(p.profile_id) ? ' (manager)' : ''}`}
                  trailing={
                    <>
                      <span className="type-figure-md text-lg text-ink">{p.confirmed_buyins}</span>
                      <span className="text-[12.5px] text-muted">
                        buy-in{p.confirmed_buyins === 1 ? '' : 's'}
                      </span>
                    </>
                  }
                />
              ))}
            </ListGroup>
          </>
        )}

        {cashedOutPlayers.length > 0 && (
          <>
            <h2 className="type-label-caption mb-2 mt-4 text-muted">Cashed out ({cashedOutPlayers.length})</h2>
            <ListGroup>
              {cashedOutPlayers.map((p) => {
                const bankNet = p.cashout! - p.confirmed_buyins * game.stake
                return (
                  <ListRow
                    key={p.id}
                    className="cursor-pointer opacity-80"
                    onClick={() => openPlayerSheet(p)}
                    avatar={
                      <span className="relative shrink-0">
                        <NamedAvatar name={p.full_name} className="h-12 w-12" />
                        <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-canvas bg-error" />
                      </span>
                    }
                    title={`${p.full_name}${p.is_host ? ' (host)' : managerIds.has(p.profile_id) ? ' (manager)' : ''}`}
                    subtitle={`${p.confirmed_buyins} buy-in${p.confirmed_buyins === 1 ? '' : 's'} · cashed out ${formatChips(p.cashout!, ratio)}`}
                    trailing={
                      <>
                        <ChipsFigure
                          amount={Math.abs(bankNet)}
                          ratio={ratio}
                          tone={bankNet >= 0 ? 'win' : 'error'}
                          icon={
                            bankNet >= 0 ? (
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowDown className="h-3.5 w-3.5" />
                            )
                          }
                        />
                        {p.cashout_confirm_status && (
                          <Badge variant={p.cashout_confirm_status === 'confirmed' ? 'win' : 'error'}>
                            {p.cashout_confirm_status === 'confirmed' ? 'Confirmed' : 'Disputed'}
                          </Badge>
                        )}
                      </>
                    }
                  />
                )
              })}
            </ListGroup>
          </>
        )}
      </div>

      {game.status === 'closed' ? (
        <>
          <p className="mt-4 text-center text-xs text-muted">
            Game closed — buy-ins, cash-outs, and rake above are still editable anytime.
          </p>
          <Button
            variant="secondary"
            block
            className="mt-2"
            onClick={() => navigate(`/games/${gameId}/settlement`)}
          >
            Go to settlement
          </Button>
        </>
      ) : (
        <>
          {activePlayers.length > 0 && (
            <p className="mt-4 text-center text-xs text-muted">
              {activePlayers.length === 1 ? '1 player hasn\'t' : `${activePlayers.length} players haven't`}{' '}
              cashed out yet — closing now counts their buy-ins as a loss to the table.
            </p>
          )}
          <Button
            block
            className={activePlayers.length > 0 ? 'mt-2' : 'mt-4'}
            disabled={closing}
            onClick={closeAndSettle}
          >
            {closing ? 'Closing…' : 'End game & settle'}
          </Button>
        </>
      )}

      <Sheet open={sheetPlayerId != null} onOpenChange={(open) => !open && setSheetPlayerId(null)}>
        <SheetContent>
          {sheetPlayer && (
            <>
              <SheetHeader>
                <span className="relative shrink-0">
                  <NamedAvatar name={sheetPlayer.full_name} className="h-12 w-12" />
                  <span
                    className={`absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-canvas ${
                      sheetPlayer.cashout == null ? 'bg-win' : 'bg-error'
                    }`}
                  />
                </span>
                <SheetTitle>
                  {sheetPlayer.full_name}
                  {sheetPlayer.is_host ? ' (host)' : managerIds.has(sheetPlayer.profile_id) ? ' (manager)' : ''}
                </SheetTitle>
              </SheetHeader>

              {!cashoutOn ? (
                <div className="mt-5">
                  {/* Previous/New/Overall are all shown at once, always —
                      no pill that pops in only once you've moved the
                      slider, so the three numbers that matter (where they
                      started, what's changing, what it adds up to) read
                      together from the first glance instead of shifting
                      layout as you drag. Overall gets the accent treatment
                      since it's the one that actually matters. */}
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="rounded-lg bg-surface-strong px-2 py-2.5">
                      <p className="text-[12.5px] text-muted">Previous</p>
                      <p className="type-figure-md mt-0.5 text-ink">{sheetPlayer.confirmed_buyins}</p>
                    </div>
                    <div className="rounded-lg bg-surface-strong px-2 py-2.5">
                      <p className="text-[12.5px] text-muted">New</p>
                      <p
                        className={`type-figure-md mt-0.5 ${
                          sheetDelta === 0 ? 'text-muted' : sheetDelta > 0 ? 'text-win' : 'text-error'
                        }`}
                      >
                        {sheetDelta > 0 ? '+' : ''}
                        {sheetDelta}
                      </p>
                    </div>
                    <div className="rounded-lg border border-primary/40 bg-primary/10 px-2 py-2.5">
                      <p className="text-[12.5px] text-muted">Overall</p>
                      <p className="type-figure-md mt-0.5 text-ink">{sliderValue}</p>
                    </div>
                  </div>
                  {/* min=0 on the slider already keeps the value itself
                      from going negative — Math.max is a second guard so a
                      stray onValueChange payload can never sneak a
                      negative buy-in count into state. */}
                  <Slider
                    className="mt-4"
                    min={0}
                    max={MAX_BUYINS}
                    step={1}
                    value={sliderValue}
                    onValueChange={(v) => setSliderValue(Math.max(0, v as number))}
                  />
                  <div className="mt-3 flex justify-center gap-1.5">
                    {QUICK_ADD.map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setSliderValue((v) => Math.min(MAX_BUYINS, Math.max(0, v + n)))}
                        className="rounded-full bg-surface-strong px-3.5 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-strong/70"
                      >
                        +{n}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-5 rounded-lg border border-hairline-soft bg-surface-strong p-3 text-center">
                  <p className="text-xs text-muted">Buy-ins locked</p>
                  <p className="type-figure-md text-ink">
                    {sheetPlayer.confirmed_buyins} buy-in{sheetPlayer.confirmed_buyins === 1 ? '' : 's'}
                  </p>
                  <p className="mt-1 text-xs text-muted">Turn off Cashed out below to edit buy-ins again.</p>
                </div>
              )}

              <div className="mt-5 flex items-center justify-between border-t border-hairline-soft pt-4">
                <div>
                  <p className="text-sm font-medium text-ink">Cashed out</p>
                  <p className="text-xs text-muted">Turn on once they're done playing.</p>
                </div>
                <Switch checked={cashoutOn} onCheckedChange={setCashoutOn} />
              </div>

              {cashoutOn && (
                <div className="mt-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sheet-cashout">Cash-out (banks)</Label>
                    {sheetPlayer.cashout != null && sheetPlayer.cashout_confirm_status && (
                      <Badge variant={sheetPlayer.cashout_confirm_status === 'confirmed' ? 'win' : 'error'}>
                        {sheetPlayer.cashout_confirm_status === 'confirmed' ? 'Player confirmed' : 'Player disputed'}
                      </Badge>
                    )}
                    {sheetPlayer.cashout == null && sheetPlayer.cashout_requested != null && (
                      <Badge variant="muted">Player requested</Badge>
                    )}
                  </div>
                  <Input
                    id="sheet-cashout"
                    type="number"
                    min={0}
                    className="h-12"
                    autoFocus
                    value={cashoutValue}
                    onChange={(e) => {
                      const v = e.target.value
                      // A cash-out can never be negative — block the
                      // keystroke rather than clamp after the fact, so
                      // typing "-" never even shows on screen.
                      if (v === '' || Number(v) >= 0) setCashoutValue(v)
                    }}
                  />
                  {sheetPlayer.cashout != null && sheetPlayer.cashout_confirm_status === 'confirmed' && (
                    <p className="text-xs text-muted">
                      Changing this will ask {sheetPlayer.full_name} to confirm the new amount instead.
                    </p>
                  )}
                </div>
              )}

              {(() => {
                const entries = historyByPlayer.get(sheetPlayer.id) ?? []
                if (entries.length === 0) return null
                return (
                  <div className="mt-5 border-t border-hairline-soft pt-4">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between text-left"
                      onClick={() => setHistoryOpen((v) => !v)}
                    >
                      <h2 className="type-label-caption text-muted">Buy-in history</h2>
                      <ChevronDown
                        className={`h-4 w-4 text-muted transition-transform ${historyOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {historyOpen && (
                      <div className="mt-2">
                        <ListGroup>
                          {/* One date for the whole log, not per row — this
                              is a live session, so every entry is from
                              today; repeating the date on each line would
                              just be noise. */}
                          <ListDate>
                            {new Date().toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </ListDate>
                          {entries.map((h) => (
                            <ListRow
                              key={h.id}
                              title={`${h.count * game.stake} banks`}
                              subtitle={new Date(h.confirmedAt).toLocaleTimeString([], {
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            />
                          ))}
                        </ListGroup>
                      </div>
                    )}
                  </div>
                )
              })()}

              {isOriginalHost && !sheetPlayer.is_host && (
                <div className="mt-5 flex items-center gap-3 border-t border-hairline-soft pt-4">
                  <Switch
                    checked={managerIds.has(sheetPlayer.profile_id)}
                    onCheckedChange={() => toggleManager(sheetPlayer.profile_id)}
                    aria-label="Make manager"
                  />
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted" />
                    <div>
                      <p className="text-sm font-medium text-ink">Manager</p>
                      <p className="text-xs text-muted">Can approve buy-ins & set cash-outs</p>
                    </div>
                  </div>
                </div>
              )}

              <Button block className="mt-5" disabled={savingSheet} onClick={saveSheetChanges}>
                {savingSheet ? 'Saving…' : 'Save'}
              </Button>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
