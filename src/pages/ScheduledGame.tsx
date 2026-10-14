import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useIsGameHost } from '../hooks/useIsGameHost'
import { Button } from '../components/ui/button'
import { PageSpinner } from '../components/ui/spinner'
import { InviteQrCard } from '../components/ui/invite-qr-card'
import { InvitePlayersSheet } from '../components/ui/invite-players-sheet'
import { PlayerCardsSheet } from '../components/ui/player-cards-sheet'
import { NamedAvatar } from '../components/ui/avatar'
import { giveStartingBuyin } from '../lib/seat'
import { showTime, type Rsvp } from '../lib/playerCard'
import { useAuth } from '../hooks/useAuth'

type Guest = { profile_id: string; full_name: string; is_host: boolean }
type RsvpRow = { profile_id: string; response: Rsvp; arrive: string | null; leave_by: string | null; note: string | null }

type Game = {
  id: string
  name: string
  venue_freetext: string | null
  scheduled_for: string
  stake: number
  host_id: string
  status: string
}

// See PAGE_PROMPTS.md "Scheduled Game". A `scheduled` game accepts no
// joins or buy-ins at all until the host explicitly starts it here.
export function ScheduledGame() {
  const { gameId } = useParams()
  const navigate = useNavigate()
  const [game, setGame] = useState<Game | null>(null)
  const { isHost: canManage } = useIsGameHost(gameId, game?.host_id)
  const [starting, setStarting] = useState(false)
  const { profile } = useAuth()
  const [guests, setGuests] = useState<Guest[]>([])
  const [rsvps, setRsvps] = useState<Record<string, RsvpRow>>({})
  const [addOpen, setAddOpen] = useState(false)
  const [cardsOpen, setCardsOpen] = useState(false)

  async function loadGuests() {
    if (!gameId) return
    const [gp, rs] = await Promise.all([
      supabase.from('game_players').select('profile_id, is_host, profiles(full_name)').eq('game_id', gameId),
      supabase.from('game_rsvps').select('profile_id, response, arrive, leave_by, note').eq('game_id', gameId),
    ])
    setGuests(
      ((gp.data ?? []) as unknown as { profile_id: string; is_host: boolean; profiles: { full_name: string } | null }[]).map(
        (r) => ({ profile_id: r.profile_id, is_host: r.is_host, full_name: r.profiles?.full_name ?? 'Player' })
      )
    )
    setRsvps(Object.fromEntries(((rs.data ?? []) as RsvpRow[]).map((r) => [r.profile_id, r])))
  }

  useEffect(() => {
    if (!gameId) return
    let cancelled = false

    async function load() {
      const { data } = await supabase
        .from('games')
        .select('id, name, venue_freetext, scheduled_for, stake, host_id, status')
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
    load()

    const channel = supabase
      .channel(`scheduled-game-${gameId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        load
      )
      .subscribe()
    loadGuests()
    const rsvpChannel = supabase
      .channel(`rsvps-${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_rsvps', filter: `game_id=eq.${gameId}` }, loadGuests)
      .subscribe()

    return () => {
      supabase.removeChannel(rsvpChannel)
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [gameId, navigate])

  if (!game) return <PageSpinner />

  async function handleStart() {
    if (!gameId) return
    setStarting(true)
    const { error } = await supabase.rpc('start_scheduled_game', { p_game_id: gameId })
    if (!error) {
      // Everyone seated sits down with one bank, like a player added mid-game.
      const stay = guests.filter((g) => !g.is_host && rsvps[g.profile_id]?.response !== 'out')
      for (const g of stay) await giveStartingBuyin(gameId, g.profile_id, g.full_name)
    }
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
  const isHost = canManage

  return (
    <div className="mx-auto w-full max-w-sm p-4 sm:p-6 text-center">
      <h1 className="type-page-title text-ink">{game.name}</h1>
      <p className="mt-1 text-muted">{game.venue_freetext}</p>
      <p className="text-sm text-muted">{new Date(game.scheduled_for).toLocaleString()}</p>
      <p className="mt-1 text-sm text-muted">1 buy-in = 10,000</p>

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

          <GuestList
            guests={guests}
            rsvps={rsvps}
            onAdd={() => setAddOpen(true)}
            onSend={() => setCardsOpen(true)}
          />
          <InvitePlayersSheet
            open={addOpen}
            onOpenChange={setAddOpen}
            gameId={gameId!}
            existingProfileIds={guests.map((g) => g.profile_id)}
            existingNames={guests.map((g) => g.full_name)}
            onInvited={loadGuests}
          />
          <PlayerCardsSheet
            open={cardsOpen}
            onOpenChange={setCardsOpen}
            gameId={gameId!}
            gameName={game.name}
            gameDate={game.scheduled_for}
            players={guests.filter((g) => !g.is_host)}
            hostProfileId={profile?.id}
          />

          <Button block className="mt-6" disabled={starting} onClick={handleStart}>
            {starting ? 'Starting…' : 'Start game'}
          </Button>
        </>
      ) : (
        <p className="mt-8 text-sm text-muted">
          Waiting on the host to start the game — this page updates on its own once it's live.
        </p>
      )}
    </div>
  )
}

const LABEL: Record<Rsvp, string> = { pending: 'No reply', in: 'In', maybe: 'Maybe', out: "Can't make it" }

// The guest list of a scheduled game: who is invited, what they answered, and
// the times and notes they left. Notes are visible only to the host.
function GuestList({
  guests,
  rsvps,
  onAdd,
  onSend,
}: {
  guests: Guest[]
  rsvps: Record<string, RsvpRow>
  onAdd: () => void
  onSend: () => void
}) {
  const others = guests.filter((g) => !g.is_host)
  const count = (r: Rsvp) => others.filter((g) => (rsvps[g.profile_id]?.response ?? 'pending') === r).length
  return (
    <div className="mt-6 text-left">
      <div className="flex items-end justify-between">
        <h2 className="type-label-caption text-muted">Guest list</h2>
        {others.length > 0 && (
          <span className="text-xs text-muted">
            {count('in')} in · {count('maybe')} maybe · {count('pending')} no reply
          </span>
        )}
      </div>
      {others.length > 0 && (
        <div className="mt-2 overflow-hidden rounded-xl border border-hairline bg-canvas">
          {others.map((g) => {
            const r = rsvps[g.profile_id]
            const resp = r?.response ?? 'pending'
            const times = [r?.arrive && `Arriving ${showTime(r.arrive)}`, r?.leave_by && `Leaving ${showTime(r.leave_by)}`]
              .filter(Boolean)
              .join(' · ')
            return (
              <div key={g.profile_id} className="flex items-start gap-3 border-b border-hairline p-3 last:border-b-0">
                <NamedAvatar name={g.full_name} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{g.full_name}</p>
                  {times && <p className="text-xs text-muted">{times}</p>}
                  {r?.note && <p className="mt-0.5 text-xs text-body">“{r.note}”</p>}
                </div>
                <span
                  className={
                    resp === 'in'
                      ? 'rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-on-primary'
                      : 'rounded-full bg-surface-strong px-2.5 py-1 text-xs font-semibold text-muted'
                  }
                >
                  {LABEL[resp]}
                </span>
              </div>
            )
          })}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" block onClick={onAdd}>
          Add guests
        </Button>
        {others.length > 0 && (
          <Button variant="secondary" block onClick={onSend}>
            Send cards
          </Button>
        )}
      </div>
    </div>
  )
}
