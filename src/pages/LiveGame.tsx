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
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Table, TableBody, TableCell, TableRow } from '../components/ui/table'
import { NamedAvatar } from '../components/ui/avatar'

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
  const [cashoutEditingId, setCashoutEditingId] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)

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

  async function setCashout(playerId: string, value: number) {
    await runWrite(
      () => supabase.from('game_players').update({ cashout: value }).eq('id', playerId),
      'Cash-out'
    )
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
      <h1 className="type-page-title text-ink">{game.name}</h1>

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
            <span className="text-muted">Invite walk-ins</span>
            <button
              className="text-xs text-primary underline"
              onClick={() => setInviteOpen((v) => !v)}
            >
              {inviteOpen ? 'Hide' : 'Show QR'}
            </button>
          </div>
          {inviteOpen && gameId && (
            <div className="mt-3">
              <InviteQrCard eyebrow="Live table" title={game.name} url={`${window.location.origin}/t/${gameId}`} />
            </div>
          )}
        </CardContent>
      </Card>

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
          <div className="flex items-center justify-between">
            <span className="text-muted">Rake</span>
            <Tabs value={rakeRevealed ? 'revealed' : 'masked'} onValueChange={(v) => setRakeRevealed(v === 'revealed')}>
              <TabsList>
                <TabsTrigger value="masked">Masked</TabsTrigger>
                <TabsTrigger value="revealed">Revealed</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          {rakeRevealed ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="type-figure-md text-ink">
                {toChips(game.rake, ratio)} chips
                <span className="ml-1 text-xs font-normal text-muted">({game.rake} banks)</span>
              </span>
              <Input
                type="number"
                className="h-9 w-20"
                defaultValue={game.rake}
                onBlur={(e) => setRake(Number(e.target.value) || 0)}
              />
            </div>
          ) : (
            <p className="mt-1 text-xs text-muted">Masked — only you can see this.</p>
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
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
                      <NamedAvatar name={p.full_name} className="h-6 w-6 shrink-0" />
                      <span className="truncate">
                        {p.full_name}
                        {p.is_host ? ' (host)' : ''}
                      </span>
                    </div>
                    {cashoutEditingId === p.id ? (
                      <Input
                        type="number"
                        autoFocus
                        defaultValue={p.cashout ?? ''}
                        placeholder="Cash out (banks)"
                        className="mt-1 h-9 w-28"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            setCashout(p.id, Number((e.target as HTMLInputElement).value) || 0)
                            setCashoutEditingId(null)
                          }
                        }}
                        onBlur={(e) => {
                          if (e.target.value) setCashout(p.id, Number(e.target.value) || 0)
                          setCashoutEditingId(null)
                        }}
                      />
                    ) : (
                      <div className="type-figure-md text-xs text-muted">
                        {p.cashout == null
                          ? 'In play'
                          : `${toChips(p.cashout - p.confirmed_buyins * game.stake, ratio)} chips net`}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="w-24 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="type-figure-md text-lg text-ink">{p.confirmed_buyins}</span>
                      {cashoutEditingId !== p.id && (
                        <button
                          className="shrink-0 text-xs text-muted underline"
                          onClick={() => setCashoutEditingId(p.id)}
                        >
                          {p.cashout == null ? 'Cash out' : 'Edit'}
                        </button>
                      )}
                    </div>
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
    </div>
  )
}
