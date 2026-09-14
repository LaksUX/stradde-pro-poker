import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { sendHostMagicLink, useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'

// See PAGE_PROMPTS.md "Login (host track only)". Players never see this
// screen — see Join.tsx for the player track's entire "sign up."
export function Login() {
  const { session, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  if (loading) return <div className="p-6 text-center text-muted">Loading…</div>
  if (session) return <Navigate to="/games/new" replace />

  async function handleSend() {
    setError(null)
    setSending(true)
    try {
      await sendHostMagicLink(email)
      setSent(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <div className="mb-4 flex flex-col items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary">
          ♠
        </div>
        <h1 className="text-xl font-semibold text-ink">Poker Night</h1>
      </div>

      {sent ? (
        <div className="rounded-md border border-hairline p-4 text-center">
          <p className="text-ink">Check your email for a link to sign in.</p>
          <button
            className="mt-3 text-sm text-body underline"
            onClick={() => {
              setSent(false)
            }}
          >
            Use a different email
          </button>
        </div>
      ) : (
        <>
          <label className="text-sm font-medium text-muted" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-14 rounded-sm border border-hairline px-3 text-ink focus:border-2 focus:border-ink focus:outline-none"
            placeholder="you@example.com"
          />
          {error && <p className="text-sm text-error">{error}</p>}
          <Button block disabled={!email || sending} onClick={handleSend}>
            {sending ? 'Sending…' : 'Send magic link'}
          </Button>
          <p className="text-center text-xs text-muted">
            Only for hosting a game. Players join through a shared link — no account needed.
          </p>
        </>
      )}
    </div>
  )
}
