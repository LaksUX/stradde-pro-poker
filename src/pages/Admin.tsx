import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { runWrite } from '../lib/errors'
import { Button } from '../components/ui/Button'
import { PageSpinner, InlineSpinner } from '../components/ui/Spinner'
import { ListGroup, ListRow } from '../components/ui/list-row'
import { Badge } from '../components/ui/badge'
import { NamedAvatar } from '../components/ui/avatar'

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

  async function setApproval(id: string, approved: boolean) {
    const ok = await runWrite(
      () => supabase.from('profiles').update({ approved }).eq('id', id),
      approved ? 'Approving host' : 'Revoking host'
    )
    if (ok) load()
  }

  return (
    <div className="mx-auto w-full max-w-sm p-4 sm:p-6">
      <h1 className="type-page-title text-ink">Admin</h1>
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
              subtitle={r.phone}
              trailing={
                <>
                  <Badge variant={r.role === 'host' && r.approved ? 'win' : 'muted'}>
                    {r.role}
                    {r.role === 'host' ? (r.approved ? ' · approved' : ' · pending') : ''}
                  </Badge>
                  {r.role === 'host' && (
                    <Button
                      variant={r.approved ? 'danger' : 'primary'}
                      className="h-8 px-3 text-xs"
                      onClick={() => setApproval(r.id, !r.approved)}
                    >
                      {r.approved ? 'Revoke' : 'Approve'}
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
