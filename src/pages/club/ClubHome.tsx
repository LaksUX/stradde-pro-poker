import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { canManage, clubRpc, forgetClub, fmt, type ClubMember, type ClubTable, type Kyc } from '../../lib/club'
import { useClub } from '../../hooks/useClub'
import { toast } from '../../lib/toast'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { ListGroup, ListRow } from '../../components/ui/list-row'
import { NamedAvatar } from '../../components/ui/avatar'
import { PageSpinner } from '../../components/ui/spinner'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../../components/ui/sheet'
import { ClubPromptSheet } from '../../components/ui/club-prompt-sheet'

type Tab = 'tables' | 'members' | 'audit'
type AuditRow = { id: number; actor_name: string | null; action: string; detail: Record<string, unknown>; created_at: string }

const PILL: Record<Kyc, string> = {
  verified: 'rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-on-primary',
  pending: 'rounded-full bg-surface-strong px-2.5 py-1 text-xs font-semibold text-muted',
  blocked: 'rounded-full bg-error/10 px-2.5 py-1 text-xs font-semibold text-error',
}

export function ClubHome() {
  const navigate = useNavigate()
  const { ctx, loading } = useClub()
  const [tab, setTab] = useState<Tab>('tables')
  const [tables, setTables] = useState<ClubTable[]>([])
  const [members, setMembers] = useState<ClubMember[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [q, setQ] = useState('')
  const [addMember, setAddMember] = useState(false)
  const [newTable, setNewTable] = useState(false)
  const [editing, setEditing] = useState<ClubMember | null>(null)

  const reload = useCallback(async () => {
    if (!ctx) return
    const [t, m] = await Promise.all([
      supabase.from('club_tables').select('*').eq('club_id', ctx.clubId).order('created_at', { ascending: false }),
      supabase.from('club_members').select('*').eq('club_id', ctx.clubId).order('full_name'),
    ])
    setTables((t.data ?? []) as ClubTable[])
    setMembers((m.data ?? []) as ClubMember[])
    if (canManage(ctx.role)) {
      const a = await supabase.from('club_audit').select('id, actor_name, action, detail, created_at').eq('club_id', ctx.clubId).order('created_at', { ascending: false }).limit(60)
      setAudit((a.data ?? []) as AuditRow[])
    }
  }, [ctx])

  useEffect(() => {
    reload()
  }, [reload])

  if (loading) return <PageSpinner />
  if (!ctx) {
    navigate('/club', { replace: true })
    return null
  }
  const manager = canManage(ctx.role)
  const shown = members.filter((m) => m.full_name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="mx-auto w-full max-w-md p-4 pb-16 sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="type-label-caption text-muted">MVP Club · {ctx.role}</p>
          <h1 className="mt-0.5 text-2xl font-bold text-ink">{ctx.name}</h1>
          <p className="text-sm text-muted">{ctx.staffName}</p>
        </div>
        <button type="button" className="cta-soft rounded-full px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink" onClick={() => { forgetClub(); navigate('/club') }}>
          Switch
        </button>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-1 rounded-lg bg-surface-strong/60 p-1">
        {(['tables', 'members', ...(manager ? (['audit'] as const) : [])] as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={tab === t ? 'rounded-md bg-canvas py-2 text-sm font-semibold capitalize text-ink' : 'py-2 text-sm font-semibold capitalize text-muted'}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'tables' && (
        <div className="mt-4">
          {manager && <Button block variant="secondary" onClick={() => setNewTable(true)}>New table</Button>}
          {tables.length === 0 ? (
            <p className="mt-4 rounded-xl border border-hairline bg-canvas p-5 text-center text-sm text-muted">No tables yet.</p>
          ) : (
            <ListGroup className="mt-3">
              {tables.map((t) => (
                <ListRow
                  key={t.id}
                  title={t.name}
                  subtitle={t.status === 'closed' ? `Closed · variance ${fmt(t.variance)}` : t.status === 'open' ? `Open · ${fmt(t.opening_chips)} chips at start` : 'Waiting to open'}
                  trailing={<span className={t.status === 'open' ? PILL.verified : PILL.pending}>{t.status}</span>}
                  onClick={() => navigate(`/club/tables/${t.id}`)}
                />
              ))}
            </ListGroup>
          )}
        </div>
      )}

      {tab === 'members' && (
        <div className="mt-4">
          <div className="flex gap-2">
            <Input className="h-11" placeholder="Search members" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button variant="secondary" onClick={() => setAddMember(true)}>Add</Button>
          </div>
          <ListGroup className="mt-3">
            {shown.map((m) => (
              <ListRow
                key={m.id}
                avatar={<NamedAvatar name={m.full_name} className="h-10 w-10" />}
                title={m.full_name}
                subtitle={m.kyc_status === 'verified' ? `${m.id_type} · ····${m.id_last4}` : m.kyc_status === 'blocked' ? m.block_reason : 'Not verified yet'}
                trailing={<span className={PILL[m.kyc_status]}>{m.kyc_status}</span>}
                onClick={manager ? () => setEditing(m) : undefined}
              />
            ))}
          </ListGroup>
          {!manager && <p className="mt-2 text-xs text-muted">Only a manager or owner can verify or block members.</p>}
        </div>
      )}

      {tab === 'audit' && (
        <ListGroup className="mt-4">
          {audit.map((a) => (
            <ListRow key={a.id} title={a.action.replace(/_/g, ' ')} subtitle={`${a.actor_name ?? 'System'} · ${new Date(a.created_at).toLocaleString()}`} />
          ))}
        </ListGroup>
      )}

      <ClubPromptSheet
        open={newTable}
        onOpenChange={setNewTable}
        title="New table"
        placeholder="Table name, e.g. Table 1"
        submitLabel="Create table"
        onSubmit={async (v) => {
          try {
            await clubRpc('club_create_table', { p_club: ctx.clubId, p_name: v })
            setNewTable(false)
            reload()
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not create the table')
          }
        }}
      />
      <ClubPromptSheet
        open={addMember}
        onOpenChange={setAddMember}
        title="Add a member"
        description="They start as not verified. A manager verifies them at the desk."
        placeholder="Full name"
        submitLabel="Add member"
        onSubmit={async (v) => {
          try {
            await clubRpc('club_add_member', { p_club: ctx.clubId, p_name: v })
            setAddMember(false)
            reload()
          } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Could not add the member')
          }
        }}
      />
      <KycSheet member={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }} />
    </div>
  )
}

const ID_TYPES = ['Government ID', 'Passport', 'Driving licence']

function KycSheet({ member, onClose, onDone }: { member: ClubMember | null; onClose: () => void; onDone: () => void }) {
  const [idType, setIdType] = useState(ID_TYPES[0])
  const [last4, setLast4] = useState('')
  const [consent, setConsent] = useState(true)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setIdType(member?.id_type ?? ID_TYPES[0])
    setLast4(member?.id_last4 ?? '')
    setConsent(member?.share_consent ?? true)
    setReason('')
  }, [member])

  async function set(status: Kyc) {
    if (!member) return
    setBusy(true)
    try {
      await clubRpc('club_set_kyc', { p_member: member.id, p_status: status, p_id_type: idType, p_id_last4: last4, p_reason: reason, p_consent: consent })
      onDone()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open={!!member} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{member?.full_name}</SheetTitle>
        </SheetHeader>
        <p className="mt-1 text-sm text-muted">Staff check the ID at the desk. Only the type and last four characters are recorded.</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {ID_TYPES.map((t) => (
            <button key={t} type="button" onClick={() => setIdType(t)} className={idType === t ? 'rounded-lg border border-primary bg-primary px-1 py-2.5 text-xs font-semibold text-on-primary' : 'rounded-lg border border-hairline bg-canvas px-1 py-2.5 text-xs font-semibold text-ink'}>
              {t}
            </button>
          ))}
        </div>
        <Input className="mt-3 h-12" maxLength={4} placeholder="Last four characters of the ID" value={last4} onChange={(e) => setLast4(e.target.value)} />
        <label className="mt-3 flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          Member agrees to share their verified status with participating clubs
        </label>
        <Button block className="mt-4" disabled={busy} onClick={() => set('verified')}>Mark verified</Button>
        <Input className="mt-5 h-12" placeholder="Reason, if blocking" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="destructive" disabled={busy} onClick={() => set('blocked')}>Block</Button>
          <Button variant="secondary" disabled={busy} onClick={() => set('pending')}>Set pending</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
