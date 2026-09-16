import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

// See PAGE_PROMPTS.md "Pending Approval". Shown to a signed-in phone
// identity with role: 'host' and approved: false — reached only via Apply
// to Host, never as a side effect of merely signing in.
export function PendingApproval() {
  const { session, profile, loading } = useAuth()
  const navigate = useNavigate()

  if (loading) return <div className="p-6 text-center text-muted">Loading…</div>
  if (!session) return <Navigate to="/continue" replace />
  if (profile?.role === 'host' && profile.approved) return <Navigate to="/games/new" replace />

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/continue')
  }

  return (
    <div className="mx-auto max-w-sm p-6 text-center">
      <h1 className="text-lg font-semibold text-ink">Pending approval</h1>
      <p className="mt-2 text-muted">
        Your host application exists — an admin needs to approve it before you can create
        games. This doesn't affect joining games other people host.
      </p>
      <button className="mt-6 text-sm text-primary underline" onClick={() => navigate('/home')}>
        Back to Home
      </button>
      <button className="mt-4 block w-full text-sm text-muted underline" onClick={handleLogout}>
        Log out
      </button>
    </div>
  )
}
