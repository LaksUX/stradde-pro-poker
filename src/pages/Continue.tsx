import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { withTimeout } from '../lib/errors'
import { Button } from '../components/ui/button'
import { PageSpinner } from '../components/ui/spinner'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { signInWithGroup, startGroup } from '../lib/groupAuth'
import { clearPendingInvite, pendingInvite } from '../lib/hostInvites'

// See PAGE_PROMPTS.md "Continue" — replaces Login. One entry point for
// everyone, whether they're about to host or just wanted to open the app
// with no game link in hand. Join.tsx is the same mechanism in the context
// of a specific game link.
export function Continue() {
  const { session, profile, loading } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [linkExpired, setLinkExpired] = useState(false)
  // MVP 2.0: hosts start a group (name + PIN) or get back in with a group ID
  // and PIN. Phone sign-in is gone, and players never sign in at all.
  // Hosting is by invitation: the start form only shows once an invite link has
  // been opened on this phone.
  const invite = pendingInvite()
  const [mode, setMode] = useState<'start' | 'signin'>(invite ? 'start' : 'signin')
  const [groupName, setGroupName] = useState('')
  const [groupId, setGroupId] = useState('')
  const [pin, setPin] = useState('')

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
    if (profile.role === 'host' && profile.approved) return <Navigate to="/home" replace />
    if (profile.role === 'host' && !profile.approved)
      return <Navigate to="/pending-approval" replace />
    return <Navigate to="/home" replace />
  }

  function describe(e: unknown): string {
    return !navigator.onLine
      ? "You're offline — reconnect and try again."
      : e instanceof Error
        ? e.message
        : ((e as { message?: string })?.message ?? 'Something went wrong')
  }

  async function handleStart() {
    if (!name.trim()) {
      setError('Add your name')
      return
    }
    if (!/^[0-9]{4}$/.test(pin)) {
      setError('PIN must be 4 digits')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await withTimeout(startGroup(name.trim(), groupName.trim(), pin, invite))
      clearPendingInvite()
      navigate('/games/new')
    } catch (e) {
      setError(describe(e))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSignIn() {
    if (!groupId.trim() || !/^[0-9]{4}$/.test(pin)) {
      setError('Enter your group ID and 4-digit PIN')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await withTimeout(signInWithGroup(groupId.trim(), pin))
      navigate('/home')
    } catch (e) {
      setError(describe(e))
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
          That link has expired or already been used. Sign in below with your group ID and PIN.
        </p>
      )}

      {mode === 'signin' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="continue-group">Group ID</Label>
            <Input
              id="continue-group"
              className="h-14 uppercase tracking-widest"
              autoCapitalize="characters"
              placeholder="ABC-D2EF"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="continue-pin">PIN</Label>
            <Input
              id="continue-pin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              className="h-14 tracking-[0.5em]"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <Button block disabled={submitting} onClick={handleSignIn}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="continue-name">Your name</Label>
            <Input id="continue-name" className="h-14" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="continue-groupname">Group name (optional)</Label>
            <Input
              id="continue-groupname"
              className="h-14"
              placeholder="Friday Night"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="continue-newpin">Choose a 4-digit PIN</Label>
            <Input
              id="continue-newpin"
              type="password"
              inputMode="numeric"
              maxLength={4}
              className="h-14 tracking-[0.5em]"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            />
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <Button block disabled={submitting} onClick={handleStart}>
            {submitting ? 'Setting up…' : 'Start my group'}
          </Button>
          <p className="text-center text-xs text-muted">
            No email, no phone number. You'll get a group ID; with it and this PIN you can get back in on a new
            phone.
          </p>
        </>
      )}

      <div className="flex flex-col items-center gap-1 text-xs">
        {mode !== 'start' && invite && (
          <button className="cta-soft font-semibold text-muted" onClick={() => { setMode('start'); setError(null) }}>
            Start a new group
          </button>
        )}
        {!invite && (
          <p className="text-center text-muted">Hosting is by invitation. Open the link a host sent you to start.</p>
        )}
        {mode !== 'signin' && (
          <button className="cta-soft font-semibold text-muted" onClick={() => { setMode('signin'); setError(null) }}>
            I have a group ID
          </button>
        )}
      </div>
      <p className="text-center text-[12.5px] text-muted-soft">MVP 2.0 · v{__APP_VERSION__}</p>
    </div>
  )
}
