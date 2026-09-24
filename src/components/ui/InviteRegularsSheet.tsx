import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { runWrite } from '../../lib/errors'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './sheet'
import { Button } from './Button'
import { ListGroup, ListRow } from './list-row'
import { NamedAvatar } from './avatar'
import { Check } from 'lucide-react'

type Regular = { profile_id: string; full_name: string; games_played: number }

// Backs "Invite regulars" on both ScheduledGame and LiveGame — a host
// bulk-adding people straight to game_players (confirmed, no request/approve
// step) instead of everyone re-requesting to join from scratch. Only ever
// offers people who've completed a closed game with this host before (see
// host_regulars) and aren't already in this game.
export function InviteRegularsSheet({
  open,
  onOpenChange,
  gameId,
  hostId,
  existingProfileIds,
  onInvited,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  gameId: string
  hostId: string
  existingProfileIds: string[]
  onInvited: () => void
}) {
  const [regulars, setRegulars] = useState<Regular[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [inviting, setInviting] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelected(new Set())
    supabase
      .from('host_regulars')
      .select('profile_id, full_name, games_played')
      .eq('host_id', hostId)
      .order('games_played', { ascending: false })
      .then(({ data }) => setRegulars((data ?? []) as Regular[]))
  }, [open, hostId])

  const invitable = regulars.filter((r) => !existingProfileIds.includes(r.profile_id))

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleInvite() {
    if (selected.size === 0) return
    setInviting(true)
    const ok = await runWrite(
      () =>
        supabase
          .from('game_players')
          .insert([...selected].map((profile_id) => ({ game_id: gameId, profile_id }))),
      'Inviting'
    )
    setInviting(false)
    if (ok) {
      onInvited()
      onOpenChange(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Invite regulars</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          {invitable.length === 0 ? (
            <p className="rounded-lg border border-hairline bg-canvas p-4 text-center text-sm text-muted">
              {regulars.length === 0
                ? "No regulars yet — they'll show up here after their first completed game with you."
                : "Everyone you've played with before is already in this game."}
            </p>
          ) : (
            <ListGroup>
              {invitable.map((r) => (
                <ListRow
                  key={r.profile_id}
                  className="cursor-pointer"
                  onClick={() => toggle(r.profile_id)}
                  avatar={<NamedAvatar name={r.full_name} className="h-10 w-10" />}
                  title={r.full_name}
                  subtitle={`${r.games_played} game${r.games_played === 1 ? '' : 's'} together`}
                  trailing={
                    selected.has(r.profile_id) ? (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-on-primary">
                        <Check className="h-4 w-4" />
                      </div>
                    ) : (
                      <div className="h-6 w-6 rounded-full border-2 border-hairline-soft" />
                    )
                  }
                />
              ))}
            </ListGroup>
          )}
        </div>
        {invitable.length > 0 && (
          <Button block className="mt-5" disabled={selected.size === 0 || inviting} onClick={handleInvite}>
            {inviting ? 'Inviting…' : selected.size > 0 ? `Invite ${selected.size}` : 'Select players to invite'}
          </Button>
        )}
      </SheetContent>
    </Sheet>
  )
}
