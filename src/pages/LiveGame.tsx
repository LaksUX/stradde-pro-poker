import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { toChips, type ChipRatio } from '../lib/chips'
import { computeInitialSettlement, type PlayerForSettlement } from '../lib/settlement'
import { runWrite } from '../lib/errors'
import { toast } from '../lib/toast'
import { confirmDialog } from '../lib/confirmDialog'
import { Button } from '../components/ui/Button'
import { PageSpinner } from '../components/ui/Spinner'
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs'
import { InviteQrCard } from '../components/ui/InviteQrCard'
import { Popover, PopoverTrigger, PopoverContent } from '../components/ui/popover'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Table, TableBody, TableCell, TableRow } from '../components/ui/table'
import { NamedAvatar } from '../components/ui/avatar'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet'
import { Slider } from '../components/ui/slider'
import { Switch } from '../components/ui/switch'

const MAX_BUYINS = 50

type Game = {
  id: string
  name: string
  stake: number
  chip_ratio: ChipRatio
  rake: number
  table_size: number
  table_status_override: 'full' | 'open' | null
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
  full_name: string
  confirmed_buyins: number
}

function QrIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3M19 14v2M14 19h2M19 19h2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
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
  const [rakeRevealed, setRakeRevealed] = useState(false)
  const [tableSizeEditing, setTableSizeEditing] = useState(false)
  const [sheetPlayerId, setSheetPlayerId] = useState<string | null>(null)
  const [sliderValue, setSliderValue] = useState(0)
  const [cashoutOn, setCashoutOn] = useState(false)
  const [cashoutValue, setCashoutValue] = useState('')
  const [savingSheet, setSavingSheet] = useState(false)

  const sheetPlayer = players.find((p) => p.id === sheetPlayerId) ?? null

  function openPlayerSheet(p: PlayerRow) {
    setSheetPlayerId(p.id)
    setSliderValue(p.confirmed_buyins)
    setCashoutOn(p.cashout != null)
    setCashoutValue(p.cashout != null ? String(p.cashout) : '')
  }

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
        .select('id, profile_id, is_host, cashout, profiles(full_name)')
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
          is_host: row.is_host,
          cashout: row.cashout,
          full_name: row.profiles?.full_name ?? '—',
          confirmed_buyins: counts.get(row.id) ?? 0,
        }))
      )
    }

    loadGame()
    loadPending()
    loadPlayers()

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
      .subscribe()

    return () => {
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
    setSavingSheet(true)
    try {
      if (sliderValue !== sheetPlayer.confirmed_buyins) {
        const ok = await applyBuyinChange(sheetPlayer, sliderValue)
        if (!ok) return
      }
      if (cashoutOn) {
        const ok = await runWrite(
          () => supabase.from('game_players').update({ cashout: Number(cashoutValue) || 0 }).eq('id', sheetPlayer.id),
          'Cash-out'
        )
        if (!ok) return
      } else if (sheetPlayer.cashout != null) {
        const ok = await runWrite(
          () => supabase.from('game_players').update({ cashout: null }).eq('id', sheetPlayer.id),
          'Clearing cash-out'
        )
        if (!ok) return
      }
      setSheetPlayerId(null)
    } finally {
      setSavingSheet(false)
    }
  }

  async function setRake(value: number) {
    if (!gameId) return
    await runWrite(() => supabase.from('games').update({ rake: value }).eq('id', gameId), 'Rake')
  }

  async function setTableSize(value: number) {
    if (!gameId) return
    await runWrite(
      () => supabase.from('games').update({ table_size: value }).eq('id', gameId),
      'Table size'
    )
  }

  async function setTableOverride(value: 'full' | 'open' | null) {
    if (!gameId) return
    await runWrite(
      () => supabase.from('games').update({ table_status_override: value }).eq('id', gameId),
      'Table status'
    )
  }

  async function closeAndSettle() {
    if (!gameId || !game) return
    const totalIn = players.reduce((s, p) => s + p.confirmed_buyins * game.stake, 0)
    const totalOut = players.reduce((s, p) => s + (p.cashout ?? 0), 0)
    if (totalOut + game.rake > totalIn) {
      toast.error("Can't close — cash-outs plus rake exceed total buy-ins. Resolve the overpay first.")
      return
    }
    const unfinished = players.filter((p) => p.cashout == null)
    const confirmed = await confirmDialog(
      unfinished.length > 0
        ? `${unfinished.length} player(s) have no cash-out — their buy-ins will count as a loss to the table. Close and settle?`
        : 'Close this game and compute settlement?',
      { confirmLabel: 'Close & settle', danger: unfinished.length > 0 }
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

    const settlementInput: PlayerForSettlement[] = players.map((p) => ({
      gamePlayerId: p.id,
      name: p.full_name,
      netBanks: (unfinished.find((u) => u.id === p.id) ? 0 : (p.cashout ?? 0)) - p.confirmed_buyins * game.stake,
    }))
    const transfers = computeInitialSettlement(settlementInput)

    if (transfers.length > 0) {
      const ok = await runWrite(
        () =>
          supabase.from('settlement_transfers').insert(
            transfers.map((t) => ({
              game_id: gameId,
              from_player_id: t.fromPlayerId,
              to_player_id: t.toPlayerId,
              amount: t.amountBanks,
            }))
          ),
        'Settlement'
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

    navigate(`/games/${gameId}/settlement`)
  }

  if (!game) return <PageSpinner />
  if (!profile) return <div className="p-6 text-center text-muted">Sign in required.</div>

  const ratio = game.chip_ratio
  const activeSeated = players.filter((p) => p.cashout == null).length
  const full = game.table_status_override
    ? game.table_status_override === 'full'
    : activeSeated >= game.table_size

  return (
    <div className="mx-auto w-full max-w-md p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <h1 className="type-page-title text-ink">{game.name}</h1>
        {gameId && (
          <Popover>
            <PopoverTrigger className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm border border-hairline text-muted hover:bg-surface-strong hover:text-ink">
              <QrIcon />
            </PopoverTrigger>
            <PopoverContent>
              <InviteQrCard eyebrow="Live table" title={game.name} url={`${window.location.origin}/t/${gameId}`} />
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Pending requests need action now — they lead the screen, ahead of
          the always-there utility cards below (invite, table status, rake),
          so a host opening mid-game sees what's waiting on them first. */}
      {pending.length > 0 && (
        <Card className="mt-3 border border-primary/40">
          <CardContent>
            <h2 className="type-label-caption mb-2 text-primary">
              Pending requests ({pending.length})
            </h2>
            {pending.map((r) => (
              <div
                key={r.id}
                className="mb-3 rounded-sm border border-hairline-soft bg-surface-strong p-3 last:mb-0"
              >
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
                  <NamedAvatar name={r.requester_name} className="h-6 w-6 shrink-0" />
                  <span className="truncate">
                    {r.requester_name}
                    {r.request_type === 'more_buyins' ? ' — more buy-ins' : ''}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-muted">
                  {r.count} buy-in{r.count > 1 ? 's' : ''} · requested{' '}
                  {new Date(r.requested_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  <Button variant="primary" block className="h-10" onClick={() => confirmRequest(r)}>
                    Confirm
                  </Button>
                  <Button variant="danger" block className="h-10" onClick={() => declineRequest(r.id)}>
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="mt-3">
        <CardContent>
          <div className="flex items-center justify-between">
            <Badge variant={full ? 'error' : 'win'}>
              {full ? 'Full' : 'Open'} · {activeSeated}/{game.table_size}
            </Badge>
            <button
              className="text-xs text-muted underline"
              onClick={() => setTableSizeEditing((v) => !v)}
            >
              {tableSizeEditing ? 'Done' : 'Edit'}
            </button>
          </div>
          {tableSizeEditing && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="table-size">Table size</Label>
                <Input
                  id="table-size"
                  type="number"
                  className="h-9 w-16"
                  defaultValue={game.table_size}
                  onBlur={(e) => setTableSize(Number(e.target.value) || 9)}
                />
              </div>
              <Tabs
                value={game.table_status_override ?? 'auto'}
                onValueChange={(v) => setTableOverride(v === 'auto' ? null : (v as 'open' | 'full'))}
              >
                <TabsList>
                  <TabsTrigger value="auto">Auto</TabsTrigger>
                  <TabsTrigger value="open">Open</TabsTrigger>
                  <TabsTrigger value="full">Full</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-3">
        <CardContent>
          <button
            type="button"
            className="flex w-full items-center justify-between text-left"
            onClick={() => setRakeRevealed((v) => !v)}
          >
            <span className="text-muted">Rake</span>
            {rakeRevealed ? (
              <span className="type-figure-md text-ink">{toChips(game.rake, ratio)} chips</span>
            ) : (
              <span className="type-figure-md tracking-widest text-muted">••••</span>
            )}
          </button>
          {rakeRevealed && (
            <div className="mt-2 flex items-center gap-2">
              <Input
                type="number"
                className="h-9 w-20"
                defaultValue={game.rake}
                onBlur={(e) => setRake(Number(e.target.value) || 0)}
              />
              <span className="text-xs text-muted">({game.rake} banks) · only you can see this</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-4">
        {players.length === 0 && (
          <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
            No one has joined yet — share the link.
          </p>
        )}
        {players.length > 0 && (
          <Table>
            <TableBody>
              {players.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => openPlayerSheet(p)}>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
                      <span className="relative shrink-0">
                        <NamedAvatar name={p.full_name} className="h-6 w-6" />
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-canvas ${
                            p.cashout == null ? 'bg-win' : 'bg-error'
                          }`}
                        />
                      </span>
                      <span className="truncate">
                        {p.full_name}
                        {p.is_host ? ' (host)' : ''}
                      </span>
                    </div>
                    <div className="type-figure-md text-xs text-muted">
                      {p.cashout == null
                        ? `${p.confirmed_buyins} buy-in${p.confirmed_buyins === 1 ? '' : 's'}`
                        : `${toChips(p.cashout - p.confirmed_buyins * game.stake, ratio)} chips net`}
                    </div>
                  </TableCell>
                  <TableCell className="w-16 text-right">
                    <span className="type-figure-md text-lg text-ink">{p.confirmed_buyins}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Button block className="mt-4" onClick={closeAndSettle}>
        End game &amp; settle
      </Button>

      <Sheet open={sheetPlayerId != null} onOpenChange={(open) => !open && setSheetPlayerId(null)}>
        <SheetContent>
          {sheetPlayer && (
            <>
              <SheetHeader>
                <span className="relative shrink-0">
                  <NamedAvatar name={sheetPlayer.full_name} />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-canvas ${
                      sheetPlayer.cashout == null ? 'bg-win' : 'bg-error'
                    }`}
                  />
                </span>
                <SheetTitle>
                  {sheetPlayer.full_name}
                  {sheetPlayer.is_host ? ' (host)' : ''}
                </SheetTitle>
              </SheetHeader>

              {!cashoutOn ? (
                <div className="mt-5">
                  <p className="text-xs text-muted">
                    {sheetPlayer.confirmed_buyins} buy-in{sheetPlayer.confirmed_buyins === 1 ? '' : 's'} so far
                  </p>
                  <p className="type-figure-hero mt-1 text-center text-ink">{sliderValue}</p>
                  <Slider
                    className="mt-3"
                    min={0}
                    max={MAX_BUYINS}
                    step={1}
                    value={sliderValue}
                    onValueChange={(v) => setSliderValue(v as number)}
                  />
                  <p className="mt-1 text-center text-xs text-muted">total buy-ins</p>
                </div>
              ) : (
                <div className="mt-5 rounded-lg border border-hairline-soft bg-surface-strong p-3 text-center">
                  <p className="text-xs text-muted">Buy-ins locked</p>
                  <p className="type-figure-md text-ink">
                    {sheetPlayer.confirmed_buyins} buy-in{sheetPlayer.confirmed_buyins === 1 ? '' : 's'}
                  </p>
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
                  <Label htmlFor="sheet-cashout">Cash-out (banks)</Label>
                  <Input
                    id="sheet-cashout"
                    type="number"
                    className="h-12"
                    autoFocus
                    value={cashoutValue}
                    onChange={(e) => setCashoutValue(e.target.value)}
                  />
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
