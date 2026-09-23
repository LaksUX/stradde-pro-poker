import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { runWrite } from '../lib/errors'
import { Button } from '../components/ui/Button'
import { PageSpinner, InlineSpinner } from '../components/ui/Spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
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
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-24 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2">
                    <NamedAvatar name={r.full_name ?? '—'} className="shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-ink">{r.full_name ?? '—'}</p>
                      <p className="truncate text-xs text-muted">{r.phone}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={r.role === 'host' && r.approved ? 'win' : 'muted'} className="max-w-full truncate">
                    {r.role}
                    {r.role === 'host' ? (r.approved ? ' · approved' : ' · pending') : ''}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {r.role === 'host' && (
                    <Button
                      variant={r.approved ? 'danger' : 'primary'}
                      className="h-8 px-3 text-xs"
                      onClick={() => setApproval(r.id, !r.approved)}
                    >
                      {r.approved ? 'Revoke' : 'Approve'}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
