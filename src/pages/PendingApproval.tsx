import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { PageSpinner } from '../components/ui/spinner'

// See PAGE_PROMPTS.md "Pending Approval". Shown to a signed-in phone
// identity with role: 'host' and approved: false. Hosting is admin-granted
// (see Admin.tsx's makeHost) and always approved on the spot, so this state
// shouldn't occur in normal use anymore — kept as a defensive fallback in
// case a host is ever demoted mid-way or a profile is edited directly.
export function PendingApproval() {
  const { session, profile, loading } = useAuth()
  const navigate = useNavigate()

  if (loading) return <PageSpinner />
  if (!session) return <Navigate to="/continue" replace />
  if (profile?.role === 'host' && profile.approved) return <Navigate to="/games/new" replace />

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/continue')
  }

  return (
    <div className="mx-auto w-full max-w-sm p-4 sm:p-6 text-center">
      <h1 className="type-page-title text-ink">Pending approval</h1>
      <p className="type-body-md mt-2 text-body">
        Hosting is paused for your account. Ask the person who invited you, or an admin, to
        turn it back on. This doesn't affect joining games other people host.
      </p>
      <button className="cta-soft mt-6 text-sm text-primary" onClick={() => navigate('/home')}>
        Back to Home
      </button>
      <button className="cta-soft mt-4 w-full py-2.5 text-sm text-muted" onClick={handleLogout}>
        Log out
      </button>
    </div>
  )
}
