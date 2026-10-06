import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatChips, fromChips, toChips, type ChipRatio } from '../lib/chips'
import { SETTLE_LABEL, settleState, type MarkColumns } from '../lib/settlement'
import { Badge } from '../components/ui/badge'
import { runWrite } from '../lib/errors'
import { toast } from '../lib/toast'
import { Button } from '../components/ui/button'
import { PageSpinner } from '../components/ui/spinner'
import { ListGroup, ListRow } from '../components/ui/list-row'
import { Select } from '../components/ui/select'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { NamedAvatar } from '../components/ui/avatar'
import { ChipsFigure } from '../components/ui/chips-figure'
import { ArrowRight, ChevronDown, IdCard } from 'lucide-react'
import { PlayerCardsSheet } from '../components/ui/player-cards-sheet'

type Game = { id: string; name: string; chip_ratio: ChipRatio; settlement_published_at: string | null }
type PlayerOpt = { id: string; name: string; profile_id: string }
type Transfer = {
  id: string
  from_player_id: string
  to_player_id: string
  amount: number
  status: 'pending' | 'confirmed' | 'disputed'
  request_note: string | null
} & MarkColumns

// See PAGE_PROMPTS.md "Settlement". Reached from Live Game's "End game &
// settle". Settlement is never frozen — the host can keep editing after
// close (see REQUIREMENTS.md's Game lifecycle) — publishing is a separate,
// deliberate action from editing.
export function Settlement() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<PlayerOpt[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [cardsOpen, setCardsOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  // Read-only by default, editing entered deliberately per row — a settlement
  // reads clearer as "who owes whom, how much, confirmed or not" than as a
  // permanently-open pair of dropdowns, and editing a real money transfer
  // shouldn't be one accidental tap away either.
  const [editingId, setEditingId] = useState<string | null>(null)

  async function loadAll() {
    if (!gameId) return
    const { data: g } = await supabase
      .from('games')
      .select('id, name, chip_ratio, settlement_published_at')
      .eq('id', gameId)
      .single()
    setGame(g as Game)

    const { data: rows } = await supabase
      .from('game_players')
      .select('id, profile_id, profiles(full_name)')
      .eq('game_id', gameId)
    setPlayers((rows ?? []).map((r: any) => ({ id: r.id, profile_id: r.profile_id, name: r.profiles?.full_name ?? '—' })))

    const { data: ts } = await supabase
      .from('settlement_transfers')
      .select('id, from_player_id, to_player_id, amount, status, request_note, payer_marked_at, payee_marked_at, disputed_at')
      .eq('game_id', gameId)
    setTransfers((ts ?? []) as Transfer[])
  }

  useEffect(() => {
    loadAll()
  }, [gameId])

  if (!game) return <PageSpinner />
  const ratio = game.chip_ratio
  const nameById = new Map(players.map((p) => [p.id, p.name]))

  async function editTransfer(id: string, patch: Partial<Transfer>) {
    // Optimistic update, but rolled back on failure — this money is real
    // enough that "the screen said it saved" has to actually mean it did,
    // not just that the local click handler ran. See PAGE_PROMPTS.md's
    // Global offline edge case.
    const previous = transfers.find((t) => t.id === id)
    setTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    const ok = await runWrite(
      () => supabase.from('settlement_transfers').update(patch).eq('id', id),
      'Settlement change'
    )
    if (!ok && previous) {
      setTransfers((prev) => prev.map((t) => (t.id === id ? previous : t)))
    }
  }

  async function removeTransfer(id: string) {
    const previous = transfers.find((t) => t.id === id)
    const previousIndex = transfers.findIndex((t) => t.id === id)
    setTransfers((prev) => prev.filter((t) => t.id !== id))
    const ok = await runWrite(
      () => supabase.from('settlement_transfers').delete().eq('id', id),
      'Removing transfer'
    )
    if (!ok && previous) {
      setTransfers((prev) => {
        const next = [...prev]
        next.splice(previousIndex, 0, previous)
        return next
      })
    }
  }

  async function addCustomTransfer() {
    if (!gameId || players.length < 2) return
    const { data, error } = await supabase
      .from('settlement_transfers')
      .insert({
        game_id: gameId,
        from_player_id: players[0].id,
        to_player_id: players[1].id,
        // amount must be > 0 (settlement_transfers' own check constraint) —
        // this was inserting 0 and failing on every single click. 1 is a
        // placeholder the host immediately edits via the row this opens
        // straight into, same as any other transfer's amount.
        amount: 1,
        status: 'pending',
      })
      .select('id, from_player_id, to_player_id, amount, status, request_note, payer_marked_at, payee_marked_at, disputed_at')
      .single()
    if (error) {
      toast.error(navigator.onLine ? error.message : "Couldn't add — you're offline. Reconnect and try again.")
      return
    }
    const t = data as Transfer
    setTransfers((prev) => [...prev, t])
    setEditingId(t.id)
  }

  return (
    <div className="mx-auto w-full max-w-md p-4 sm:p-6">
      <h1 className="type-page-title text-ink">{sharing ? 'Share with players' : 'Settlement'}</h1>
      <p className="type-body-md mt-1 text-body">
        {sharing
          ? 'Send each player their private card. It shows their night and who they settle with.'
          : 'Who settles with whom. Tap a line to change it.'}
      </p>
      {transfers.length > 0 && (
        <p className="mt-2 text-sm font-semibold text-ink">
          {transfers.filter((t) => settleState(t) === 'settled').length} of {transfers.length} settled
        </p>
      )}
      {gameId && (
        <PlayerCardsSheet
          open={cardsOpen}
          onOpenChange={setCardsOpen}
          gameId={gameId}
          gameName={game.name}
          gameDate={new Date().toISOString()}
          players={players.map((p) => ({ profile_id: p.profile_id, full_name: p.name }))}
        />
      )}

      {sharing ? (
        <div className="mt-6 flex flex-col gap-3">
          <Button block onClick={() => setCardsOpen(true)}>
            <IdCard className="mr-2 h-4 w-4" /> Send player cards
          </Button>
          <Button variant="secondary" block onClick={() => setSharing(false)}>
            Back to settlement
          </Button>
          <Button variant="ghost" block onClick={() => navigate('/home')}>
            Done
          </Button>
        </div>
      ) : (
        <>
      {transfers.length > 0 && (
        <ListGroup className="mt-3">
          {transfers.map((t) => {
            const fromName = nameById.get(t.from_player_id) ?? '—'
            const toName = nameById.get(t.to_player_id) ?? '—'
            const editing = editingId === t.id
            return (
              <div key={t.id}>
                <ListRow
                  className="cursor-pointer"
                  onClick={() => setEditingId(editing ? null : t.id)}
                  avatar={
                    <div className="flex items-center">
                      <NamedAvatar name={fromName} className="h-10 w-10 border-2 border-canvas" />
                      <NamedAvatar name={toName} className="-ml-3 h-10 w-10 border-2 border-canvas" />
                    </div>
                  }
                  title={
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span>{fromName}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted" />
                      <span>{toName}</span>
                    </span>
                  }
                  subtitle={t.request_note ? <>Player's proposed change: "{t.request_note}"</> : undefined}
                  trailing={
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-end gap-1">
                        <ChipsFigure amount={t.amount} ratio={ratio} />
                        <Badge
                          variant={
                            settleState(t) === 'settled' ? 'win' : settleState(t) === 'disputed' ? 'error' : 'muted'
                          }
                        >
                          {settleState(t) === 'marked' ? 'Marked' : SETTLE_LABEL[settleState(t)]}
                        </Badge>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted transition-transform ${editing ? 'rotate-180' : ''}`}
                      />
                    </div>
                  }
                />

                {editing && (
                  <div className="px-3 pb-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Label htmlFor={`from-${t.id}`}>From</Label>
                        <Select
                          id={`from-${t.id}`}
                          className="mt-1 h-9 text-sm"
                          value={t.from_player_id}
                          onChange={(e) => editTransfer(t.id, { from_player_id: e.target.value })}
                        >
                          {players.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <span className="mt-6 shrink-0 text-xs text-muted">owes</span>
                      <div className="flex-1">
                        <Label htmlFor={`to-${t.id}`}>To</Label>
                        <Select
                          id={`to-${t.id}`}
                          className="mt-1 h-9 text-sm"
                          value={t.to_player_id}
                          onChange={(e) => editTransfer(t.id, { to_player_id: e.target.value })}
                        >
                          {players.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    <div className="mt-2">
                      <Label htmlFor={`amount-${t.id}`}>Amount · 1 buy-in = {formatChips(1, ratio)}</Label>
                      <Input
                        id={`amount-${t.id}`}
                        type="number"
                        className="mt-1 h-9"
                        defaultValue={toChips(t.amount, ratio)}
                        onBlur={(e) => editTransfer(t.id, { amount: fromChips(Number(e.target.value) || 0, ratio) })}
                      />
                    </div>
                    <button
                      className="mt-2 text-xs text-error underline"
                      onClick={() => removeTransfer(t.id)}
                    >
                      Remove transfer
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </ListGroup>
      )}

      <Button variant="ghost" block className="mt-3" onClick={addCustomTransfer}>
        Add custom payment
      </Button>

      <Button block className="mt-4" onClick={() => setSharing(true)}>
        Looks right · Share cards
      </Button>
        </>
      )}
    </div>
  )
}
