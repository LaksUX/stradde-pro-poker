import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { PageSpinner } from '../components/ui/spinner'

// MVP 2.0 co-host link (/m/:token): open it, type a name, and you can run
// that one game. No phone number, PIN or account. See 0024_manager_invites.sql.
export function ManagerJoin() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [hasProfile, setHasProfile] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function claim(withName: string) {
    if (!token) return
    setBusy(true)
    setError(null)
    const { data, error } = await supabase.rpc('claim_manager_invite', {
      p_token: token,
      p_name: withName,
    })
    if (error) {
      setError(error.message)
      setBusy(false)
      return
    }
    navigate(`/games/${data as string}/live`, { replace: true })
  }

  useEffect(() => {
    let cancelled = false
    async function start() {
      let user = (await supabase.auth.getSession()).data.session?.user ?? null
      if (!user) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error || !data.user) {
          if (!cancelled) setError('Could not start a session. Check your connection and try again.')
          if (!cancelled) setReady(true)
          return
        }
        user = data.user
      }
      const { data: p } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle()
      if (cancelled) return
      if (p) {
        // Already has a profile on this phone: just claim, no name needed.
        setHasProfile(true)
        await claim('')
      }
      if (!cancelled) setReady(true)
    }
    start()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (!ready) return <PageSpinner />

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center gap-4 p-4 sm:p-6">
      <h1 className="type-page-title text-center text-ink">Help run this game</h1>
      {hasProfile ? (
        <>
          {error ? <p className="text-center text-sm text-error">{error}</p> : <PageSpinner />}
        </>
      ) : (
        <>
          <p className="type-body-md text-center text-body">
            You've been invited as a co-host. Add your name and you can approve buy-ins and enter cash-outs.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="manager-name">Your name</Label>
            <Input id="manager-name" className="h-14" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <Button block disabled={busy || !name.trim()} onClick={() => claim(name.trim())}>
            {busy ? 'Joining…' : 'Join as co-host'}
          </Button>
        </>
      )}
    </div>
  )
}
