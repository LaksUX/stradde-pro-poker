import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { runWrite } from '../lib/errors'
import { Button } from '../components/ui/button'
import { PageSpinner, InlineSpinner } from '../components/ui/spinner'
import { ListGroup, ListRow } from '../components/ui/list-row'
import { Badge } from '../components/ui/badge'
import { NamedAvatar } from '../components/ui/avatar'
import { ensureHostInvite, hostInviteUrl } from '../lib/hostInvites'
import { toast } from '../lib/toast'

type ProfileRow = {
  id: string
  full_name: string | null
  phone: string | null
  role: 'player' | 'host' | 'admin'
  approved: boolean
}

// See PAGE_PROMPTS.md "Admin". Reachable only for role: 'admin' accounts.
// No profile starts as admin — bootstrap the first one with:
//   update profiles set role = 'admin' where phone = '<your E.164 phone>';
export function Admin() {
  const { session, profile, loading } = useAuth()
  const [rows, setRows] = useState<ProfileRow[]>([])
  const [loadingRows, setLoadingRows] = useState(true)

  async function load() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, phone, role, approved')
      .neq('role', 'admin')
    setRows((data ?? []) as ProfileRow[])
    setLoadingRows(false)
  }

  useEffect(() => {
    if (profile?.role === 'admin') load()
  }, [profile])

  if (loading) return <PageSpinner />
  if (!session) return <Navigate to="/continue" replace />
  if (profile?.role !== 'admin') return <Navigate to="/home" replace />

  async function approve(id: string) {
    const ok = await runWrite(
      () => supabase.from('profiles').update({ approved: true }).eq('id', id),
      'Approving host'
    )
    if (ok) load()
  }

  // Sets role back to 'player' rather than just flipping approved — a
  // revoked host used to stay stuck at role: 'host', approved: false
  // forever (reading as "pending" alongside actual new applicants), which
  // also meant they never had to re-apply to get it back. This is a full
  // demotion: they'd need to apply (or be made a host again) from scratch.
  // Doesn't touch any game they already host — is_game_host() checks the
  // game's own host_id, not profiles.role.
  async function removeHost(id: string) {
    const ok = await runWrite(
      () => supabase.from('profiles').update({ role: 'player', approved: false }).eq('id', id),
      'Removing host'
    )
    if (ok) load()
  }

  // The self-serve "Apply to host" flow is still there, but not every
  // player wants to go find it — this lets an admin hand someone the role
  // directly, already approved, in one step.
  async function makeHost(id: string) {
    const ok = await runWrite(
      () => supabase.from('profiles').update({ role: 'host', approved: true }).eq('id', id),
      'Making host'
    )
    if (ok) load()
  }

  return (
    <div className="mx-auto w-full max-w-sm p-4 sm:p-6">
      <h1 className="type-page-title text-ink">Admin</h1>
      <Button
        variant="secondary"
        block
        className="mt-4"
        onClick={async () => {
          try {
            const url = hostInviteUrl(await ensureHostInvite())
            const text = `Run your own game nights on Straddle. Open this to get started:\n${url}`
            if (navigator.share) await navigator.share({ title: 'Host on Straddle', text }).catch(() => {})
            else {
              await navigator.clipboard.writeText(text)
              toast.success('Invite copied')
            }
          } catch {
            toast.error('Could not make the invite link')
          }
        }}
      >
        Send a host invite link
      </Button>
      {loadingRows && <InlineSpinner />}
      {!loadingRows && rows.length === 0 && (
        <p className="mt-4 text-center text-sm text-muted">No profiles yet.</p>
      )}
      {!loadingRows && rows.length > 0 && (
        <ListGroup className="mt-4">
          {rows.map((r) => (
            <ListRow
              key={r.id}
              avatar={<NamedAvatar name={r.full_name ?? '—'} className="h-12 w-12" />}
              title={r.full_name ?? '—'}
              trailing={
                <>
                  <Badge variant={r.role === 'host' && r.approved ? 'win' : 'muted'}>
                    {r.role}
                    {r.role === 'host' ? (r.approved ? ' · approved' : ' · pending') : ''}
                  </Badge>
                  {r.role === 'player' && (
                    <Button variant="default" className="h-8 px-3 text-xs" onClick={() => makeHost(r.id)}>
                      Make host
                    </Button>
                  )}
                  {r.role === 'host' && !r.approved && (
                    <div className="flex gap-1.5">
                      <Button variant="default" className="h-8 px-3 text-xs" onClick={() => approve(r.id)}>
                        Approve
                      </Button>
                      <Button variant="destructive" className="h-8 px-3 text-xs" onClick={() => removeHost(r.id)}>
                        Decline
                      </Button>
                    </div>
                  )}
                  {r.role === 'host' && r.approved && (
                    <Button variant="destructive" className="h-8 px-3 text-xs" onClick={() => removeHost(r.id)}>
                      Revoke
                    </Button>
                  )}
                </>
              }
            />
          ))}
        </ListGroup>
      )}
    </div>
  )
}
