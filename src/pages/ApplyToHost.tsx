import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { applyToHost, useAuth } from '../hooks/useAuth'
import { withTimeout } from '../lib/errors'
import { Button } from '../components/ui/Button'

// See PAGE_PROMPTS.md "Apply to Host". Reached from Home. The explicit
// action that requests the host role — hosting is never inferred from how
// someone signed in, only granted by tapping this button.
export function ApplyToHost() {
  const { session, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return <div className="p-6 text-center text-muted">Loading…</div>
  if (!session) return <Navigate to="/continue" replace />
  if (profile?.role === 'host') return <Navigate to="/pending-approval" replace />

  async function handleApply() {
    setSubmitting(true)
    setError(null)
    try {
      await withTimeout(applyToHost())
      navigate('/pending-approval')
    } catch (e) {
      setError(
        !navigator.onLine
          ? "You're offline — reconnect and try again."
          : e instanceof Error
            ? e.message
            : 'Something went wrong'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-sm p-6 text-center">
      <h1 className="text-lg font-semibold text-ink">Apply to host</h1>
      <p className="mt-2 text-muted">
        Run your own games instead of just joining them. An admin approves new hosts to keep
        random signups from spinning up games.
      </p>
      {error && <p className="mt-3 text-sm text-error">{error}</p>}
      <Button block className="mt-6" disabled={submitting} onClick={handleApply}>
        {submitting ? 'Applying…' : 'Apply to host'}
      </Button>
    </div>
  )
}
