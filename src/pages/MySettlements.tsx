import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { toChips, type ChipRatio } from '../lib/chips'
import { runWrite } from '../lib/errors'
import { Button } from '../components/ui/Button'
import { PageSpinner, InlineSpinner } from '../components/ui/Spinner'

type Row = {
  id: string
  gameId: string
  gameName: string
  direction: 'owe' | 'owed'
  otherName: string
  amount: number
  status: 'pending' | 'confirmed' | 'disputed'
  chip_ratio: ChipRatio
}

// See PAGE_PROMPTS.md "My Settlements". Every transfer this identity has
// been party to, across every game, not just the one just played.
export function MySettlements() {
  const { session, profile, loading } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [loadingRows, setLoadingRows] = useState(true)
  const [noteOpenId, setNoteOpenId] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')

  async function load() {
    if (!profile) return
    setLoadingRows(true)
    const { data: myPlayers } = await supabase
      .from('game_players')
      .select('id, game_id')
      .eq('profile_id', profile.id)
    const myPlayerIds = (myPlayers ?? []).map((p) => p.id)
    if (myPlayerIds.length === 0) {
      setRows([])
      setLoadingRows(false)
      return
    }

    const orFilter = myPlayerIds.map((id) => `from_player_id.eq.${id},to_player_id.eq.${id}`).join(',')
    const { data: transfers } = await supabase
      .from('settlement_transfers')
      .select('id, from_player_id, to_player_id, amount, status, game_id')
      .or(orFilter)

    const results: Row[] = []
    for (const t of transfers ?? []) {
      const mine = myPlayerIds.includes(t.from_player_id) ? t.from_player_id : t.to_player_id
      const otherId = t.from_player_id === mine ? t.to_player_id : t.from_player_id
      const direction: 'owe' | 'owed' = t.from_player_id === mine ? 'owe' : 'owed'
      const { data: other } = await supabase
        .from('game_players')
        .select('profiles(full_name)')
        .eq('id', otherId)
        .maybeSingle()
      const { data: g } = await supabase
        .from('games')
        .select('name, chip_ratio')
        .eq('id', t.game_id)
        .maybeSingle()
      results.push({
        id: t.id,
        gameId: t.game_id,
        gameName: g?.name ?? '—',
        direction,
        otherName: (other as any)?.profiles?.full_name ?? '—',
        amount: t.amount,
        status: t.status,
        chip_ratio: (g?.chip_ratio as ChipRatio) ?? '1:1',
      })
    }
    setRows(results)
    setLoadingRows(false)
  }

  useEffect(() => {
    load()
  }, [profile])

  if (loading) return <PageSpinner />
  if (!session) return <Navigate to="/continue" replace />

  async function setStatus(id: string, status: 'confirmed' | 'disputed', note?: string) {
    const ok = await runWrite(
      () =>
        supabase
          .from('settlement_transfers')
          .update({ status, ...(note ? { request_note: note } : {}) })
          .eq('id', id),
      status === 'confirmed' ? 'Confirming' : 'Sending request'
    )
    if (!ok) return
    setNoteOpenId(null)
    setNoteText('')
    load()
  }

  const totalOwed = rows.filter((r) => r.direction === 'owed').reduce((s, r) => s + toChips(r.amount, r.chip_ratio), 0)
  const totalOwe = rows.filter((r) => r.direction === 'owe').reduce((s, r) => s + toChips(r.amount, r.chip_ratio), 0)

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="text-lg font-semibold text-ink">My settlements</h1>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-hairline bg-canvas p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Owed to you</p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums text-win">{totalOwed} chips</p>
        </div>
        <div className="rounded-lg border border-hairline bg-canvas p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">You owe</p>
          <p className="mt-1 font-mono text-lg font-bold tabular-nums text-error">{totalOwe} chips</p>
        </div>
      </div>

      {loadingRows && <InlineSpinner />}
      {!loadingRows && rows.length === 0 && (
        <p className="mt-4 text-center text-sm text-muted">No settlements yet.</p>
      )}

      {rows.map((r) => (
        <div key={r.id} className="mt-3 rounded-lg border border-hairline bg-canvas p-3">
          <Link to={`/games/${r.gameId}`} className="text-xs text-primary underline">
            {r.gameName}
          </Link>
          <p className="mt-1 text-ink">
            {r.direction === 'owe' ? `You owe ${r.otherName}` : `${r.otherName} owes you`}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-lg font-mono font-bold tabular-nums text-ink">{toChips(r.amount, r.chip_ratio)} chips</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                r.status === 'confirmed'
                  ? 'bg-win/10 text-win'
                  : r.status === 'disputed'
                    ? 'bg-error/10 text-error'
                    : 'bg-surface-strong text-muted'
              }`}
            >
              {r.status}
            </span>
          </div>
          {r.status === 'pending' && (
            <div className="mt-2 flex gap-2">
              <Button variant="primary" className="h-8 px-3 text-xs" onClick={() => setStatus(r.id, 'confirmed')}>
                Confirm
              </Button>
              <Button
                variant="danger"
                className="h-8 px-3 text-xs"
                onClick={() => setNoteOpenId(noteOpenId === r.id ? null : r.id)}
              >
                Request change
              </Button>
            </div>
          )}
          {noteOpenId === r.id && (
            <div className="mt-2">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="e.g. I think this should be 20 banks"
                className="h-9 w-full rounded-sm border border-hairline bg-surface-strong px-2 text-sm"
              />
              <Button
                variant="danger"
                className="mt-2 h-8 w-full text-xs"
                onClick={() => setStatus(r.id, 'disputed', noteText)}
              >
                Send request
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
