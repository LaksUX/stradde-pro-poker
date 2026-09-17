import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { supabase } from '../lib/supabase'
import { Button } from '../components/ui/Button'

type Game = {
  id: string
  name: string
  venue_freetext: string | null
  scheduled_for: string
  stake: number
  host_id: string
}

// See PAGE_PROMPTS.md "Scheduled Game". A `scheduled` game accepts no
// joins or buy-ins at all until the host explicitly starts it here.
export function ScheduledGame() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const [game, setGame] = useState<Game | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    if (!gameId) return
    supabase
      .from('games')
      .select('id, name, venue_freetext, scheduled_for, stake, host_id')
      .eq('id', gameId)
      .single()
      .then(({ data }) => setGame(data as Game))
  }, [gameId])

  if (!game) return <div className="p-6 text-center text-muted">Loading…</div>

  async function handleStart() {
    if (!gameId) return
    setStarting(true)
    const { error } = await supabase.from('games').update({ status: 'live' }).eq('id', gameId)
    setStarting(false)
    if (error) {
      alert(navigator.onLine ? error.message : "Couldn't start — you're offline. Reconnect and try again.")
      return
    }
    navigate(`/t/${gameId}`)
  }

  return (
    <div className="mx-auto max-w-sm p-6 text-center">
      <h1 className="text-lg font-semibold text-ink">{game.name}</h1>
      <p className="mt-1 text-muted">{game.venue_freetext}</p>
      <p className="text-sm text-muted">{new Date(game.scheduled_for).toLocaleString()}</p>
      <p className="mt-1 text-sm text-muted">{game.stake} banks buy-in</p>

      <div className="mx-auto mt-6 w-fit rounded-sm border-4 border-canvas p-1 shadow-elevated">
        <QRCodeSVG value={`${window.location.origin}/t/${gameId}`} size={120} />
      </div>
      <p className="mt-2 text-xs text-muted">
        Share this link ahead of time — it shows "not started yet" until you start it.
      </p>

      <Button block className="mt-6" disabled={starting} onClick={handleStart}>
        {starting ? 'Starting…' : 'Start game'}
      </Button>
    </div>
  )
}
