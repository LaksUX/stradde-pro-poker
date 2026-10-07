import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { claimPendingInvite, getHostInvite, setPendingInvite } from '../lib/hostInvites'
import { Button } from '../components/ui/button'
import { PageSpinner } from '../components/ui/spinner'

// /h/:token: a friend's invite to host their own games. They start their own
// group on the next screen; the invite is claimed once it exists.
export function HostJoin() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { profile, loading } = useAuth()
  const [inviter, setInviter] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (!token) return
    getHostInvite(token)
      .then((r) => setInviter(r?.inviter ?? null))
      .catch(() => setInviter(null))
  }, [token])

  if (loading || inviter === undefined) return <PageSpinner />

  if (inviter === null) {
    return (
      <div className="mx-auto w-full max-w-sm p-6 text-center">
        <h1 className="text-xl font-bold text-ink">This invite is no longer valid</h1>
        <p className="mt-2 text-sm text-muted">Ask for a new link.</p>
      </div>
    )
  }

  async function start() {
    if (!token) return
    setPendingInvite(token)
    if (profile && (profile.role === 'host' || profile.role === 'admin')) {
      await claimPendingInvite()
      navigate('/home', { replace: true })
      return
    }
    navigate('/continue')
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold text-ink">{inviter} invited you to host</h1>
      <p className="text-sm text-body">
        Run your own game nights. Your players and results stay yours. Set up takes a minute: a name and a 4-digit PIN.
      </p>
      <Button block onClick={start}>
        Start hosting
      </Button>
    </div>
  )
}
