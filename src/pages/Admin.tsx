import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { runWrite } from '../lib/errors'
import { Button } from '../components/ui/Button'
import { PageSpinner, InlineSpinner } from '../components/ui/Spinner'

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
    <div className="mx-auto max-w-sm p-6">
      <h1 className="text-lg font-semibold text-ink">Admin</h1>
      {loadingRows && <InlineSpinner />}
      {!loadingRows && rows.length === 0 && (
        <p className="mt-4 text-center text-sm text-muted">No profiles yet.</p>
      )}
      <div className="mt-4 rounded-md border border-hairline">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between border-b border-hairline-soft p-3 text-sm last:border-none"
          >
            <div>
              <p className="text-ink">{r.full_name ?? '—'}</p>
              <p className="text-xs text-muted">
                {r.phone} · {r.role}
                {r.role === 'host' ? (r.approved ? ' · approved' : ' · pending') : ''}
              </p>
            </div>
            {r.role === 'host' && (
              <Button
                variant={r.approved ? 'danger' : 'primary'}
                className="h-8 px-3 text-xs"
                onClick={() => setApproval(r.id, !r.approved)}
              >
                {r.approved ? 'Revoke' : 'Approve'}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
