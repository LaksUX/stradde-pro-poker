import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { canManage, clubRpc, fmt, parseChips, type ClubMember, type ClubTable as TableRow } from '../../lib/club'
import { useClub } from '../../hooks/useClub'
import { toast } from '../../lib/toast'
import { Button } from '../../components/ui/button'
import { ListGroup, ListRow } from '../../components/ui/list-row'
import { NamedAvatar } from '../../components/ui/avatar'
import { PageSpinner } from '../../components/ui/spinner'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet'
import { ClubPromptSheet } from '../../components/ui/club-prompt-sheet'

type Seat = { id: string; member_id: string }
type Entry = { id: string; seat_id: string | null; kind: 'buyin' | 'cashout' | 'rake'; chips: number; voided_at: string | null; void_reason: string | null; created_at: string }
type Dialog =
  | { kind: 'open' }
  | { kind: 'close' }
  | { kind: 'rake' }
  | { kind: 'buyin' | 'cashout'; seat: Seat }
  | { kind: 'void'; entry: Entry }
  | null

const sum = (es: Entry[], kind: Entry['kind']) => es.filter((e) => e.kind === kind && !e.voided_at).reduce((a, e) => a + Number(e.chips), 0)

export function ClubTable() {
  const { tableId } = useParams()
  const navigate = useNavigate()
  const { ctx, loading } = useClub()
  const [table, setTable] = useState<TableRow | null>(null)
  const [seats, setSeats] = useState<Seat[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [members, setMembers] = useState<ClubMember[]>([])
  const [dialog, setDialog] = useState<Dialog>(null)
  const [picking, setPicking] = useState(false)

  const reload = useCallback(async () => {
    if (!tableId || !ctx) return
    const [t, s, e, m] = await Promise.all([
      supabase.from('club_tables').select('*').eq('id', tableId).maybeSingle(),
      supabase.from('club_seats').select('id, member_id').eq('table_id', tableId).order('seated_at'),
      supabase.from('club_entries').select('id, seat_id, kind, chips, voided_at, void_reason, created_at').eq('table_id', tableId).order('created_at'),
      supabase.from('club_members').select('*').eq('club_id', ctx.clubId).order('full_name'),
    ])
    setTable((t.data as TableRow) ?? null)
    setSeats((s.data ?? []) as Seat[])
    setEntries(((e.data ?? []) as Entry[]).map((x) => ({ ...x, chips: Number(x.chips) })))
    setMembers((m.data ?? []) as ClubMember[])
  }, [tableId, ctx])

  useEffect(() => {
    reload()
  }, [reload])

  if (loading || (ctx && !table)) return <PageSpinner />
  if (!ctx || !table) {
    navigate('/club', { replace: true })
    return null
  }
  const manager = canManage(ctx.role)
  const nameOf = (id: string) => members.find((m) => m.id === id)?.full_name ?? 'Member'
  const buyins = sum(entries, 'buyin')
  const cashouts = sum(entries, 'cashout')
  const rake = sum(entries, 'rake')
  const expectedTray = (table.opening_chips ?? 0) - buyins + cashouts + rake
  const open = table.status === 'open'

  async function act(fn: () => Promise<unknown>, done?: () => void) {
    try {
      await fn()
      setDialog(null)
      done?.()
      reload()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That did not save')
    }
  }

  const unseated = members.filter((m) => m.kyc_status === 'verified' && !seats.some((s) => s.member_id === m.id))

  return (
    <div className="mx-auto w-full max-w-md p-4 pb-16 sm:p-6">
      <button type="button" className="text-sm font-semibold text-muted" onClick={() => navigate('/club/home')}>Back</button>
      <p className="type-label-caption mt-3 text-muted">{ctx.name}</p>
      <h1 className="text-2xl font-bold text-ink">{table.name}</h1>

      {table.status === 'scheduled' && (
        <div className="mt-5 rounded-xl border border-hairline bg-canvas p-5">
          <h2 className="text-base font-bold text-ink">Count the chips before you start</h2>
          <p className="mt-1 text-sm text-muted">The table opens with the total chip count in the tray. Closing is checked against it.</p>
          {manager ? (
            <Button block className="mt-4" onClick={() => setDialog({ kind: 'open' })}>Enter chip count and open</Button>
          ) : (
            <p className="mt-3 text-sm text-muted">A manager opens the table.</p>
          )}
        </div>
      )}

      {table.status !== 'scheduled' && (
        <div className="hero-card mt-5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl p-5">
          <Figure label="Opening count" value={fmt(table.opening_chips)} />
          <Figure label="With players" value={fmt(buyins - cashouts - rake)} />
          <Figure label="Buy-ins" value={fmt(buyins)} />
          <Figure label="Cash-outs" value={fmt(cashouts)} />
          <Figure label="Rake collected" value={fmt(rake)} />
          <Figure label={table.status === 'closed' ? 'Counted at close' : 'Tray should hold'} value={fmt(table.status === 'closed' ? table.closing_chips : expectedTray)} />
        </div>
      )}

      {table.status === 'closed' && (
        <p className={table.variance === 0 ? 'mt-3 rounded-lg bg-surface-strong p-3 text-sm font-semibold text-ink' : 'mt-3 rounded-lg bg-error/10 p-3 text-sm font-semibold text-error'}>
          {table.variance === 0 ? 'Reconciled: the tray matches the opening count.' : `Variance ${fmt(table.variance)} chips. Investigate before the next table.`}
        </p>
      )}

      {open && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setPicking(true)}>Seat a member</Button>
          <Button variant="secondary" onClick={() => setDialog({ kind: 'rake' })}>Collect rake</Button>
        </div>
      )}

      {table.status !== 'scheduled' && (
        <>
          <h2 className="type-label-caption mt-6 mb-2 text-muted">Players</h2>
          {seats.length === 0 ? (
            <p className="rounded-xl border border-hairline bg-canvas p-5 text-center text-sm text-muted">No one seated yet.</p>
          ) : (
            <ListGroup>
              {seats.map((s) => {
                const mine = entries.filter((e) => e.seat_id === s.id)
                const inChips = sum(mine, 'buyin')
                const outChips = sum(mine, 'cashout')
                const out = mine.some((e) => e.kind === 'cashout' && !e.voided_at)
                return (
                  <ListRow
                    key={s.id}
                    avatar={<NamedAvatar name={nameOf(s.member_id)} className="h-10 w-10" />}
                    title={nameOf(s.member_id)}
                    subtitle={`In ${fmt(inChips)}${out ? ` · Out ${fmt(outChips)}` : ' · still playing'}`}
                    trailing={
                      open ? (
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="secondary" onClick={() => setDialog({ kind: 'buyin', seat: s })}>Buy-in</Button>
                          {inChips > 0 && !out && <Button size="sm" onClick={() => setDialog({ kind: 'cashout', seat: s })}>Cash out</Button>}
                        </div>
                      ) : undefined
                    }
                  />
                )
              })}
            </ListGroup>
          )}

          <h2 className="type-label-caption mt-6 mb-2 text-muted">Ledger</h2>
          <ListGroup>
            {[...entries].reverse().map((e) => (
              <ListRow
                key={e.id}
                title={
                  <span className={e.voided_at ? 'text-muted line-through' : ''}>
                    {e.kind === 'buyin' ? 'Buy-in' : e.kind === 'cashout' ? 'Cash-out' : 'Rake'} · {fmt(e.chips)}
                  </span>
                }
                subtitle={`${e.seat_id ? nameOf(seats.find((s) => s.id === e.seat_id)?.member_id ?? '') : 'Table'}${e.voided_at ? ` · voided: ${e.void_reason}` : ''}`}
                trailing={
                  open && manager && !e.voided_at ? (
                    <Button size="sm" variant="destructive" onClick={() => setDialog({ kind: 'void', entry: e })}>Void</Button>
                  ) : undefined
                }
              />
            ))}
          </ListGroup>
          {entries.length === 0 && <p className="mt-2 text-center text-sm text-muted">Nothing recorded yet.</p>}
        </>
      )}

      {open && manager && (
        <Button block variant="secondary" className="mt-6" onClick={() => setDialog({ kind: 'close' })}>Close table</Button>
      )}

      <Sheet open={picking} onOpenChange={setPicking}>
        <SheetContent>
          <SheetHeader><SheetTitle>Seat a member</SheetTitle></SheetHeader>
          <p className="mt-1 text-sm text-muted">Only verified members can sit.</p>
          <ListGroup className="mt-3 max-h-[50vh] overflow-y-auto">
            {unseated.map((m) => (
              <ListRow
                key={m.id}
                avatar={<NamedAvatar name={m.full_name} className="h-9 w-9" />}
                title={m.full_name}
                onClick={() => act(() => clubRpc('club_seat_member', { p_table: table.id, p_member: m.id }), () => setPicking(false))}
              />
            ))}
          </ListGroup>
        </SheetContent>
      </Sheet>

      <ClubPromptSheet
        open={dialog?.kind === 'open'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Total chip count"
        description="Count every chip in the tray before the first player sits."
        placeholder="Chips in the tray"
        numeric
        submitLabel="Open table"
        onSubmit={(v) => act(() => clubRpc('club_open_table', { p_table: table.id, p_opening_chips: parseChips(v) }))}
      />
      <ClubPromptSheet
        open={dialog?.kind === 'rake'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Collect rake"
        description="Chips taken from the table. Nothing is set in advance."
        placeholder="Chips collected"
        numeric
        submitLabel="Record rake"
        onSubmit={(v) => act(() => clubRpc('club_post_rake', { p_table: table.id, p_chips: parseChips(v) }))}
      />
      <ClubPromptSheet
        open={dialog?.kind === 'buyin' || dialog?.kind === 'cashout'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={dialog?.kind === 'cashout' ? 'Cash out' : 'Buy-in'}
        description={dialog && 'seat' in dialog ? nameOf(dialog.seat.member_id) : undefined}
        placeholder={dialog?.kind === 'cashout' ? "Chips they are returning" : 'Chips issued'}
        numeric
        submitLabel="Record"
        onSubmit={(v) => dialog && 'seat' in dialog ? act(() => clubRpc('club_post_entry', { p_seat: dialog.seat.id, p_kind: dialog.kind, p_chips: parseChips(v) })) : Promise.resolve()}
      />
      <ClubPromptSheet
        open={dialog?.kind === 'void'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Void this entry"
        description="Entries are never deleted. Give the reason for the audit log."
        placeholder="Reason"
        submitLabel="Void entry"
        onSubmit={(v) => dialog?.kind === 'void' ? act(() => clubRpc('club_void_entry', { p_entry: dialog.entry.id, p_reason: v })) : Promise.resolve()}
      />
      <ClubPromptSheet
        open={dialog?.kind === 'close'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Close table"
        description={`Count the tray. It should hold ${fmt(expectedTray)}.`}
        placeholder="Chips counted in the tray"
        numeric
        submitLabel="Close and reconcile"
        onSubmit={(v) => act(async () => {
          const r = await clubRpc<{ variance: number }>('club_close_table', { p_table: table.id, p_closing_chips: parseChips(v) })
          toast[r.variance === 0 ? 'success' : 'error'](r.variance === 0 ? 'Reconciled' : `Variance ${fmt(r.variance)} chips`)
        })}
      />
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-bold text-ink">{value}</p>
    </div>
  )
}
