import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { continueWithPhone } from '../hooks/useAuth'
import { withTimeout } from '../lib/errors'
import { BuyinPicker } from '../components/ui/BuyinPicker'
import { Button } from '../components/ui/Button'
import { toChips, type ChipRatio } from '../lib/chips'
import { PageSpinner } from '../components/ui/Spinner'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'

type GameSummary = {
  id: string
  name: string
  venue_freetext: string | null
  scheduled_for: string
  status: 'scheduled' | 'live' | 'closed'
  stake: number
  table_size: number
  table_status_override: 'full' | 'open' | null
}

// See PAGE_PROMPTS.md "Join" — the entire player track's "sign up." No
// email, no password, no OTP. Submitting creates a PENDING request; it does
// not grant a buy-in — see REQUIREMENTS.md's money-integrity correction.
export function Join() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const [game, setGame] = useState<GameSummary | null>(null)
  const [seated, setSeated] = useState(0)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [count, setCount] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!gameId) return
    supabase
      .from('public_game_summary')
      .select('*')
      .eq('id', gameId)
      .maybeSingle()
      .then(({ data }) => setGame(data as GameSummary | null))

    supabase
      .from('public_live_roster')
      .select('profile_id')
      .eq('game_id', gameId)
      .then(({ data }) => setSeated(data?.length ?? 0))
  }, [gameId])

  if (!game) {
    return <PageSpinner />
  }

  if (game.status === 'scheduled') {
    return (
      <div className="mx-auto max-w-sm p-6 text-center">
        <h1 className="type-page-title text-ink">{game.name}</h1>
        <p className="type-body-md mt-2 text-body">
          Starts {new Date(game.scheduled_for).toLocaleString()} — the host hasn't opened this
          game yet.
        </p>
      </div>
    )
  }
  if (game.status === 'closed') {
    return (
      <div className="mx-auto max-w-sm p-6 text-center text-muted">This game has ended.</div>
    )
  }

  const full = game.table_status_override
    ? game.table_status_override === 'full'
    : seated >= game.table_size
  // Chip ratio isn't exposed on public_game_summary (it's not needed pre-join,
  // and keeping the public view narrow is deliberate — see the view's comment
  // in 0002_rls_policies.sql). Default to 1:1 for this display-only estimate.
  const ratio: ChipRatio = '1:1'

  async function handleSubmit() {
    if (!name.trim() || !phone.trim() || !gameId) {
      setError('Name and phone are both required')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const profile = await withTimeout(continueWithPhone(name.trim(), phone.trim()))
      const { error: reqError } = await supabase.from('buyin_requests').insert({
        game_id: gameId,
        profile_id: profile.id,
        requester_name: name.trim(),
        request_type: 'join',
        count,
      })
      if (reqError) throw reqError
      navigate(`/t/${gameId}`)
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
    <div className="mx-auto max-w-sm p-6">
      <Card>
        <CardContent>
          <h1 className="type-page-title text-ink">{game.name}</h1>
          <p className="text-sm text-muted">{game.venue_freetext}</p>
          <p className="text-sm text-muted">
            {game.stake} banks buy-in ({toChips(game.stake, ratio)} chips)
          </p>
          <Badge variant={full ? 'error' : 'win'} className="mt-2">
            {full ? 'Table full' : 'Seats open'} · {seated}/{game.table_size}
          </Badge>
        </CardContent>
      </Card>

      {full && (
        <p className="mt-3 text-sm text-muted">
          Table's full — request anyway if you're replacing someone or want to wait for a seat.
        </p>
      )}

      <div className="mt-4 flex flex-col gap-1.5">
        <Label htmlFor="join-name">Name</Label>
        <Input id="join-name" className="h-14" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        <Label htmlFor="join-phone">Phone</Label>
        <Input
          id="join-phone"
          type="tel"
          className="h-14"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      <p className="mt-4 text-sm font-medium text-muted">How many buy-ins?</p>
      <BuyinPicker value={count} onChange={setCount} />

      {error && <p className="text-sm text-error">{error}</p>}

      <Button block className="mt-2" disabled={submitting} onClick={handleSubmit}>
        {full ? 'Request a seat anyway' : 'Request to join'}
      </Button>
      <p className="mt-3 text-center text-xs text-muted">
        Anyone with this link can request to join — the host confirms before anything counts.
      </p>
    </div>
  )
}
