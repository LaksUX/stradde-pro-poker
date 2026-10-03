import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { runWrite } from '../../lib/errors'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './sheet'
import { Button } from './button'
import { Input } from './input'
import { ListGroup, ListRow } from './list-row'
import { NamedAvatar } from './avatar'
import { Check } from 'lucide-react'

type Regular = { other_id: string; full_name: string; games_played: number }

// Bulk-add players this host has shared a closed game with before — as
// either the host of that game or just a fellow player in it, since
// my_regulars (0020 migration) covers both. Backs an "Add players" entry
// point on a live game.
export function InvitePlayersSheet({
  open,
  onOpenChange,
  gameId,
  existingProfileIds,
  onInvited,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  gameId: string
  existingProfileIds: string[]
  // Optional — callers whose game_players rows are already kept fresh by a
  // realtime subscription (e.g. LiveGame) don't need to do anything extra.
  onInvited?: () => void
}) {
  const { profile } = useAuth()
  const [regulars, setRegulars] = useState<Regular[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [inviting, setInviting] = useState(false)
  const [newName, setNewName] = useState('')
  const [addingGuest, setAddingGuest] = useState(false)

  useEffect(() => {
    if (!open || !profile) return
    setSelected(new Set())
    supabase
      .from('my_regulars')
      .select('other_id, full_name, games_played')
      .eq('viewer_id', profile.id)
      .order('games_played', { ascending: false })
      .then(({ data }) => setRegulars((data ?? []) as Regular[]))
  }, [open, profile])

  const invitable = regulars.filter((r) => !existingProfileIds.includes(r.other_id))

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // MVP 2.0: a brand-new player by name alone — no phone, no account.
  async function handleAddGuest() {
    const name = newName.trim()
    if (!name) return
    setAddingGuest(true)
    const ok = await runWrite(
      () => supabase.rpc('add_guest_player', { p_game_id: gameId, p_name: name }),
      'Adding player'
    )
    setAddingGuest(false)
    if (ok) {
      setNewName('')
      onInvited?.()
    }
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
      onInvited?.()
      onOpenChange(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add players</SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex gap-2">
          <Input
            className="h-12"
            placeholder="New name"
            value={newName}
            maxLength={40}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddGuest()}
          />
          <Button disabled={!newName.trim() || addingGuest} onClick={handleAddGuest}>
            {addingGuest ? 'Adding…' : 'Add'}
          </Button>
        </div>

        {invitable.length === 0 ? (
          <p className="mt-4 text-center text-sm text-muted">
            No one you've played with before is free to add. Type a new name above.
          </p>
        ) : (
          <ListGroup className="mt-4">
            {invitable.map((r) => (
              <ListRow
                key={r.other_id}
                className="cursor-pointer"
                onClick={() => toggle(r.other_id)}
                avatar={<NamedAvatar name={r.full_name} className="h-12 w-12" />}
                title={r.full_name}
                subtitle={`${r.games_played} game${r.games_played === 1 ? '' : 's'} together`}
                trailing={
                  selected.has(r.other_id) ? (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
                      <Check className="h-4 w-4" />
                    </span>
                  ) : (
                    <span className="h-6 w-6 rounded-full border border-hairline" />
                  )
                }
              />
            ))}
          </ListGroup>
        )}

        {invitable.length > 0 && (
          <Button block className="mt-5" disabled={selected.size === 0 || inviting} onClick={handleInvite}>
            {inviting ? 'Adding…' : selected.size > 0 ? `Add ${selected.size}` : 'Add'}
          </Button>
        )}
      </SheetContent>
    </Sheet>
  )
}
