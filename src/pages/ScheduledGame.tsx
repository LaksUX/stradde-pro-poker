import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../hooks/useAuth'
import { Button } from '../components/ui/Button'
import { PageSpinner } from '../components/ui/Spinner'
import { InviteQrCard } from '../components/ui/InviteQrCard'
import { InviteRegularsSheet } from '../components/ui/InviteRegularsSheet'
import { ListGroup, ListRow } from '../components/ui/list-row'
import { NamedAvatar } from '../components/ui/avatar'

type Game = {
  id: string
  name: string
  venue_freetext: string | null
  scheduled_for: string
  stake: number
  host_id: string
  status: string
  join_code: string | null
}
type RsvpRow = { profile_id: string; full_name: string }

// See PAGE_PROMPTS.md "Scheduled Game". A `scheduled` game accepts no
// joins or buy-ins at all until the host explicitly starts it here.
export function ScheduledGame() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [game, setGame] = useState<Game | null>(null)
  const [starting, setStarting] = useState(false)
  const [rsvps, setRsvps] = useState<RsvpRow[]>([])
  const [existingIds, setExistingIds] = useState<string[]>([])
  const [inviteOpen, setInviteOpen] = useState(false)

  useEffect(() => {
    if (!gameId) return
    let cancelled = false

    async function load() {
      const { data } = await supabase
        .from('games')
        .select('id, name, venue_freetext, scheduled_for, stake, host_id, status, join_code')
        .eq('id', gameId)
        .single()
      if (cancelled || !data) return
      setGame(data as Game)
      // The host is already routed to /t/:gameId by handleStart below; this
      // covers everyone ELSE waiting on this screen — without it, a player
      // who opened the link before the host started has no way to know the
      // game went live except manually reloading.
      if (data.status === 'live') navigate(`/t/${gameId}`, { replace: true })
    }
    async function loadRsvps() {
      const { data } = await supabase
        .from('public_game_rsvps')
        .select('profile_id, full_name')
        .eq('game_id', gameId)
        .order('responded_at', { ascending: true })
      if (!cancelled) setRsvps((data ?? []) as RsvpRow[])
    }
    async function loadExistingIds() {
      const { data } = await supabase.from('game_players').select('profile_id').eq('game_id', gameId)
      if (!cancelled) setExistingIds((data ?? []).map((r) => r.profile_id))
    }
    load()
    loadRsvps()
    loadExistingIds()

    const channel = supabase
      .channel(`scheduled-game-${gameId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        load
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_rsvps', filter: `game_id=eq.${gameId}` },
        loadRsvps
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_players', filter: `game_id=eq.${gameId}` },
        loadExistingIds
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [gameId, navigate])

  if (!game) return <PageSpinner />

  async function handleStart() {
    if (!gameId) return
    setStarting(true)
    const { error } = await supabase.from('games').update({ status: 'live' }).eq('id', gameId)
    setStarting(false)
    if (error) {
      toast.error(navigator.onLine ? error.message : "Couldn't start — you're offline. Reconnect and try again.")
      return
    }
    navigate(`/t/${gameId}`)
  }

  // Anyone with this link lands here, not just the host — the "Start game"
  // action stayed host-only at the database layer (RLS's "host updates own
  // games") but was shown to every viewer, so a player opening a shared
  // pre-game link saw a button that would just fail for them with a
  // confusing error. Gate it in the UI too, and give non-hosts their own
  // waiting state instead.
  const isHost = profile?.id === game.host_id

  return (
    <div className="mx-auto w-full max-w-sm p-4 sm:p-6 text-center">
      <h1 className="type-page-title text-ink">{game.name}</h1>
      <p className="mt-1 text-muted">{game.venue_freetext}</p>
      <p className="text-sm text-muted">{new Date(game.scheduled_for).toLocaleString()}</p>
      <p className="mt-1 text-sm text-muted">{game.stake} banks buy-in</p>

      {isHost ? (
        <>
          <div className="mt-6">
            <InviteQrCard
              eyebrow="Starts"
              title={new Date(game.scheduled_for).toLocaleString()}
              subtitle={game.venue_freetext ?? undefined}
              url={`${window.location.origin}/t/${gameId}`}
            />
          </div>
          <p className="mt-2 text-xs text-muted">
            Share this link ahead of time — it shows "not started yet" until you start it.
          </p>
          {game.join_code && (
            <p className="mt-3 text-sm text-muted">
              Or share the code:{' '}
              <span className="font-mono text-lg font-bold tracking-[0.2em] text-ink">
                {game.join_code}
              </span>
            </p>
          )}

          <Button variant="secondary" block className="mt-3" onClick={() => setInviteOpen(true)}>
            Invite regulars
          </Button>

          <div className="mt-5 border-t border-hairline-soft pt-4 text-left">
            <h2 className="type-label-caption mb-2 text-muted">Who's in ({rsvps.length})</h2>
            {rsvps.length === 0 ? (
              <p className="text-center text-sm text-muted">No one yet.</p>
            ) : (
              <ListGroup>
                {rsvps.map((r) => (
                  <ListRow
                    key={r.profile_id}
                    avatar={<NamedAvatar name={r.full_name} className="h-10 w-10" />}
                    title={r.full_name}
                  />
                ))}
              </ListGroup>
            )}
          </div>

          <Button block className="mt-6" disabled={starting} onClick={handleStart}>
            {starting ? 'Starting…' : 'Start game'}
          </Button>

          <InviteRegularsSheet
            open={inviteOpen}
            onOpenChange={setInviteOpen}
            gameId={gameId!}
            hostId={game.host_id}
            existingProfileIds={existingIds}
            onInvited={() => {
              toast.success('Invited')
            }}
          />
        </>
      ) : (
        <p className="mt-8 text-sm text-muted">
          Waiting on the host to start the game — this page updates on its own once it's live.
        </p>
      )}
    </div>
  )
}
