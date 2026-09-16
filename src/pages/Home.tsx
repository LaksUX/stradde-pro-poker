import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/Button'

// See PAGE_PROMPTS.md "Home". This is a deliberately minimal slice, not the
// full spec (no Host/Player tabs, no stats grid, no game history yet) — but
// a REAL one, not a stub, because every new phone identity under the
// unified auth model lands here by default (role: 'player'). Leaving this
// as a stub was a genuine dead end: no path forward for anyone who wanted
// to host. This unblocks that one path; the rest of the spec is still open.
export function Home() {
  const { session, profile, loading } = useAuth()
  const navigate = useNavigate()

  if (loading) return <div className="p-6 text-center text-muted">Loading…</div>
  if (!session) return <Navigate to="/continue" replace />

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/continue')
  }

  return (
    <div className="mx-auto max-w-sm p-6 text-center">
      <h1 className="text-lg font-semibold text-ink">
        Hey{profile?.full_name ? ` ${profile.full_name}` : ''}
      </h1>
      <p className="mt-2 text-muted">
        You're signed in. Games you're playing in, your stats, and your settlement history all
        live here eventually — see the "Home" section of <code>PAGE_PROMPTS.md</code> for the
        full spec, not yet built.
      </p>

      {profile?.role === 'player' && (
        <Button block className="mt-6" onClick={() => navigate('/apply-to-host')}>
          Apply to host
        </Button>
      )}

      <button className="mt-6 text-sm text-muted underline" onClick={handleLogout}>
        Log out
      </button>
    </div>
  )
}
