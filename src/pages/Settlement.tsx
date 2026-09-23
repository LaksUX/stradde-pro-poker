import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { toChips, type ChipRatio } from '../lib/chips'
import { runWrite } from '../lib/errors'
import { toast } from '../lib/toast'
import { Button } from '../components/ui/Button'
import { PageSpinner } from '../components/ui/Spinner'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Select } from '../components/ui/select'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

type Game = { id: string; name: string; chip_ratio: ChipRatio; settlement_published_at: string | null }
type PlayerOpt = { id: string; name: string }
type Transfer = {
  id: string
  from_player_id: string
  to_player_id: string
  amount: number
  status: 'pending' | 'confirmed' | 'disputed'
  request_note: string | null
}

// See PAGE_PROMPTS.md "Settlement". Reached from Live Game's "End game &
// settle". Settlement is never frozen — the host can keep editing after
// close (see REQUIREMENTS.md's Game lifecycle) — publishing is a separate,
// deliberate action from editing.
export function Settlement() {
  const { gameId } = useParams()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<PlayerOpt[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [dirty, setDirty] = useState(false)
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
      .select('id, profiles(full_name)')
      .eq('game_id', gameId)
    setPlayers((rows ?? []).map((r: any) => ({ id: r.id, name: r.profiles?.full_name ?? '—' })))

    const { data: ts } = await supabase
      .from('settlement_transfers')
      .select('id, from_player_id, to_player_id, amount, status, request_note')
      .eq('game_id', gameId)
    setTransfers((ts ?? []) as Transfer[])
  }

  useEffect(() => {
    loadAll()
  }, [gameId])

  if (!game) return <PageSpinner />
  const ratio = game.chip_ratio
  const nameById = new Map(players.map((p) => [p.id, p.name]))
  const initials = (name: string) => name.trim().charAt(0).toUpperCase() || '?'

  async function editTransfer(id: string, patch: Partial<Transfer>) {
    // Optimistic update, but rolled back on failure — this money is real
    // enough that "the screen said it saved" has to actually mean it did,
    // not just that the local click handler ran. See PAGE_PROMPTS.md's
    // Global offline edge case.
    const previous = transfers.find((t) => t.id === id)
    setTransfers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    setDirty(true)
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
    setDirty(true)
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
        amount: 0,
        status: 'pending',
      })
      .select('id, from_player_id, to_player_id, amount, status, request_note')
      .single()
    if (error) {
      toast.error(navigator.onLine ? error.message : "Couldn't add — you're offline. Reconnect and try again.")
      return
    }
    setTransfers((prev) => [...prev, data as Transfer])
    setDirty(true)
  }

  async function publish() {
    if (!gameId) return
    const ok = await runWrite(
      () =>
        supabase
          .from('games')
          .update({ settlement_published_at: new Date().toISOString() })
          .eq('id', gameId),
      'Publishing'
    )
    if (!ok) return
    setDirty(false)
    await loadAll()
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="type-page-title text-ink">{game.name} — Settlement</h1>
      <p className="type-body-md mt-1 text-body">
        Computed as a starting point, deterministic tie-break. Reassign freely below.
      </p>

      {transfers.map((t) => {
        const fromName = nameById.get(t.from_player_id) ?? '—'
        const toName = nameById.get(t.to_player_id) ?? '—'
        const editing = editingId === t.id
        return (
          <Card key={t.id} className="mt-3">
            <CardContent>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-strong text-xs font-bold text-ink">
                  {initials(fromName)}
                </span>
                <span className="truncate text-sm text-ink">{fromName}</span>
                <svg
                  className="mx-0.5 shrink-0 text-muted"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-strong text-xs font-bold text-ink">
                  {initials(toName)}
                </span>
                <span className="truncate text-sm text-ink">{toName}</span>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <Badge variant={t.status === 'confirmed' ? 'win' : t.status === 'disputed' ? 'error' : 'muted'}>
                  {t.status}
                </Badge>
                <span className="type-figure-md text-ink">
                  {toChips(t.amount, ratio)} chips
                  <span className="ml-1 text-xs font-normal text-muted">({t.amount} banks)</span>
                </span>
              </div>

              {t.request_note && (
                <p className="mt-2 text-xs text-muted">Player's proposed change: "{t.request_note}"</p>
              )}

              <div className="mt-2 flex justify-end gap-3">
                <button
                  className="text-xs text-muted underline"
                  onClick={() => setEditingId(editing ? null : t.id)}
                >
                  {editing ? 'Done' : 'Edit'}
                </button>
                <button className="text-xs text-error underline" onClick={() => removeTransfer(t.id)}>
                  Remove
                </button>
              </div>

              {editing && (
                <div className="mt-3 border-t border-hairline-soft pt-3">
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
                    <Label htmlFor={`amount-${t.id}`}>Amount (banks)</Label>
                    <Input
                      id={`amount-${t.id}`}
                      type="number"
                      className="mt-1 h-9"
                      defaultValue={t.amount}
                      onBlur={(e) => editTransfer(t.id, { amount: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      <Button variant="ghost" block className="mt-3" onClick={addCustomTransfer}>
        Add custom payment
      </Button>

      <Button block className="mt-4" onClick={publish}>
        {game.settlement_published_at ? 'Update shared link' : 'Publish to shared link'}
      </Button>
      <p className="mt-2 text-center text-xs text-muted">
        {game.settlement_published_at
          ? dirty
            ? 'Unpublished changes — players still see the last update.'
            : `Up to date · last published ${new Date(game.settlement_published_at).toLocaleTimeString()}`
          : 'Not published yet — players see nothing until you publish.'}
      </p>
    </div>
  )
}
