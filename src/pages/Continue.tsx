import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { continueWithPhone, useAuth } from '../hooks/useAuth'
import { withTimeout } from '../lib/errors'
import { Button } from '../components/ui/Button'
import { PageSpinner } from '../components/ui/Spinner'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

// See PAGE_PROMPTS.md "Continue" — replaces Login. One entry point for
// everyone, whether they're about to host or just wanted to open the app
// with no game link in hand. Join.tsx is the same mechanism in the context
// of a specific game link.
export function Continue() {
  const { session, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [linkExpired, setLinkExpired] = useState(false)

  useEffect(() => {
    // A dead/expired magic-link click (from before this app moved to
    // phone-only auth) lands here with an error in the URL hash rather than
    // a valid session — surface that plainly instead of silently showing
    // the bare form with no explanation.
    if (window.location.hash.includes('error=')) {
      setLinkExpired(true)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  if (loading) return <PageSpinner />

  // Already signed in — route by role/approval, never re-show the form.
  if (session && profile) {
    if (profile.role === 'host' && profile.approved) return <Navigate to="/games/new" replace />
    if (profile.role === 'host' && !profile.approved)
      return <Navigate to="/pending-approval" replace />
    return <Navigate to="/home" replace />
  }

  async function handleContinue() {
    if (!name.trim() || !phone.trim()) {
      setError('Name and phone are both required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const p = await withTimeout(continueWithPhone(name.trim(), phone.trim()))
      if (p.role === 'host' && p.approved) navigate('/games/new')
      else if (p.role === 'host' && !p.approved) navigate('/pending-approval')
      else navigate('/home')
    } catch (e) {
      setError(
        !navigator.onLine
          ? "You're offline — reconnect and try again."
          : e instanceof Error
            ? e.message
            : ((e as { message?: string })?.message ?? 'Something went wrong')
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 p-4 sm:p-6">
      <div className="mb-4 flex flex-col items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary">
          ♠
        </div>
        <h1 className="type-page-title text-ink">Straddle</h1>
      </div>

      {linkExpired && (
        <p className="type-body-md rounded-md border border-hairline bg-surface-strong p-3 text-center text-body">
          That link has expired or already been used. Sign in below instead — no email needed
          anymore, just your name and phone.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="continue-name">Name</Label>
        <Input id="continue-name" className="h-14" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="continue-phone">Phone</Label>
        <Input
          id="continue-phone"
          type="tel"
          className="h-14"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-error">{error}</p>}

      <Button block disabled={submitting} onClick={handleContinue}>
        {submitting ? 'Continuing…' : 'Continue'}
      </Button>
      <p className="text-center text-xs text-muted">
        No password, no code — just your name and phone. Want to host your own games? You can
        apply once you're in.
      </p>
    </div>
  )
}
