import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { toChips, type ChipRatio } from '../lib/chips'
import { runWrite } from '../lib/errors'
import { Button } from '../components/ui/Button'

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

  if (!game) return <div className="p-6 text-center text-muted">Loading…</div>
  const ratio = game.chip_ratio

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
      alert(navigator.onLine ? error.message : "Couldn't add — you're offline. Reconnect and try again.")
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
      <h1 className="text-lg font-semibold text-ink">{game.name} — Settlement</h1>
      <p className="mt-1 text-xs text-muted">
        Computed as a starting point, deterministic tie-break. Reassign freely below.
      </p>

      {transfers.map((t) => (
        <div key={t.id} className="mt-3 rounded-md border border-hairline p-3">
          <div className="flex items-center gap-2">
            <select
              value={t.from_player_id}
              onChange={(e) => editTransfer(t.id, { from_player_id: e.target.value })}
              className="h-9 flex-1 rounded-sm border border-hairline text-sm"
            >
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">owes</span>
            <select
              value={t.to_player_id}
              onChange={(e) => editTransfer(t.id, { to_player_id: e.target.value })}
              className="h-9 flex-1 rounded-sm border border-hairline text-sm"
            >
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-lg font-bold text-ink">
              {toChips(t.amount, ratio)} chips
              <span className="ml-1 text-xs font-normal text-muted">({t.amount} banks)</span>
            </span>
            <input
              type="number"
              defaultValue={t.amount}
              onBlur={(e) => editTransfer(t.id, { amount: Number(e.target.value) || 0 })}
              className="h-9 w-20 rounded-sm border border-hairline px-2 text-sm"
            />
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                t.status === 'confirmed'
                  ? 'bg-green-50 text-win'
                  : t.status === 'disputed'
                    ? 'bg-red-50 text-error'
                    : 'bg-surface-strong text-muted'
              }`}
            >
              {t.status}
            </span>
            <button
              className="ml-auto text-xs text-error underline"
              onClick={() => removeTransfer(t.id)}
            >
              Remove
            </button>
          </div>
          {t.request_note && (
            <p className="mt-2 text-xs text-muted">Player's proposed change: "{t.request_note}"</p>
          )}
        </div>
      ))}

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
