import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

const CODE_LENGTH = 6

// A bare, public route (same tier as /t/:gameId and /join/:gameId) — someone
// with a code but no link shouldn't need an account first just to resolve
// it. Success just forwards to /t/:gameId, the same screen scanning the QR
// or clicking the link lands on, so everything downstream (join, RSVP,
// already-signed-in redirect) behaves identically either way in.
export function JoinByCode() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return
    setSubmitting(true)
    setError(null)
    try {
      const { data } = await supabase
        .from('public_game_summary')
        .select('id')
        .eq('join_code', trimmed)
        .maybeSingle()
      if (!data) {
        setError("No game found with that code — double-check it and try again.")
        return
      }
      navigate(`/t/${data.id}`)
    } catch {
      setError(
        !navigator.onLine ? "You're offline — reconnect and try again." : 'Something went wrong.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 p-4 sm:p-6">
      <div className="mb-2 text-center">
        <h1 className="type-page-title text-ink">Join with a code</h1>
        <p className="type-body-md mt-2 text-body">
          Enter the {CODE_LENGTH}-character code your host shared.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="join-code">Code</Label>
        <Input
          id="join-code"
          className="h-14 text-center font-mono text-2xl tracking-[0.3em] uppercase"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, CODE_LENGTH))}
          placeholder="ABC123"
          autoFocus
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />
      </div>

      {error && <p className="text-center text-sm text-error">{error}</p>}

      <Button block disabled={submitting || code.trim().length === 0} onClick={handleSubmit}>
        {submitting ? 'Looking up…' : 'Find game'}
      </Button>
    </div>
  )
}
