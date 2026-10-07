import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { runWrite } from '../../lib/errors'
import { confirmDialog } from '../../lib/confirmDialog'
import { toast } from '../../lib/toast'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './sheet'
import { Button } from './button'
import { Input } from './input'
import { ListGroup, ListRow } from './list-row'
import { NamedAvatar } from './avatar'
import { Check } from 'lucide-react'

function normalizeName(n: string): string {
  return n.trim().replace(/\s+/g, ' ').toLowerCase()
}

type CircleName = { profile_id: string; full_name: string; games: number }
type Regular = { other_id: string; full_name: string; games_played: number }

// Add players to a live game from the host's OWN list: people from games this
// host ran (my_roster, 0027), plus a New name box. Nobody from another host's
// table ever appears here.
export function InvitePlayersSheet({
  open,
  onOpenChange,
  gameId,
  existingProfileIds,
  existingNames = [],
  onInvited,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  gameId: string
  existingProfileIds: string[]
  // Names already seated in this game, to stop the same person being added twice.
  existingNames?: string[]
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
  const [circle, setCircle] = useState<CircleName[]>([])

  useEffect(() => {
    if (!open || !profile) return
    setSelected(new Set())
    supabase
      .from('my_roster')
      .select('other_id, full_name, games_played')
      .eq('viewer_id', profile.id)
      .order('games_played', { ascending: false })
      .then(({ data }) => setRegulars((data ?? []) as Regular[]))
  }, [open, profile])

  // Names from the host's circle (hosts linked by invites), names only.
  // Picking one seats the same person instead of making a duplicate.
  useEffect(() => {
    const q = newName.trim()
    if (!open || q.length < 2) {
      setCircle([])
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      supabase
        .rpc('circle_names', { p_game_id: gameId, p_query: q })
        .then(({ data, error }) => {
          if (!cancelled) setCircle(error ? [] : ((data ?? []) as CircleName[]))
        })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [open, newName, gameId])

  const circleMatches = circle.filter(
    (c) =>
      !existingProfileIds.includes(c.profile_id) &&
      !regulars.some((r) => r.other_id === c.profile_id) &&
      !existingNames.some((n) => normalizeName(n) === normalizeName(c.full_name))
  )

  async function addFromCircle(c: CircleName) {
    setAddingGuest(true)
    const ok = await runWrite(
      () => supabase.rpc('add_circle_player', { p_game_id: gameId, p_profile_id: c.profile_id }),
      'Adding player'
    )
    setAddingGuest(false)
    if (ok) {
      setNewName('')
      onInvited?.()
    }
  }

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
    const key = normalizeName(name)
    if (existingNames.some((n) => normalizeName(n) === key)) {
      toast.error(`${name} is already in this game`)
      return
    }
    // Same person already in this host's list? Offer them instead of creating
    // a second profile with the same name.
    const match = regulars.find((r) => normalizeName(r.full_name) === key)
    if (match) {
      const useExisting = await confirmDialog(`${match.full_name} is already in your list. Use them?`, {
        confirmLabel: 'Use existing',
        cancelLabel: 'Add as new person',
      })
      if (useExisting) {
        setAddingGuest(true)
        const ok = await runWrite(
          () => supabase.from('game_players').insert({ game_id: gameId, profile_id: match.other_id }),
          'Adding player'
        )
        setAddingGuest(false)
        if (ok) {
          setNewName('')
          onInvited?.()
        }
        return
      }
    }
    const circleMatch = circle.find((c) => normalizeName(c.full_name) === key)
    if (circleMatch && !existingProfileIds.includes(circleMatch.profile_id)) {
      const useExisting = await confirmDialog(`${circleMatch.full_name} already plays in your group. Use them?`, {
        confirmLabel: 'Use existing',
        cancelLabel: 'Add as new person',
      })
      if (useExisting) {
        await addFromCircle(circleMatch)
        return
      }
    }
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

        {circleMatches.length > 0 && (
          <div className="mt-3">
            <p className="type-label-caption text-muted">Already playing in your group</p>
            <ListGroup className="mt-2">
              {circleMatches.map((c) => (
                <ListRow
                  key={c.profile_id}
                  className="cursor-pointer"
                  onClick={() => addFromCircle(c)}
                  avatar={<NamedAvatar name={c.full_name} className="h-10 w-10" />}
                  title={c.full_name}
                  trailing={<span className="text-xs font-semibold text-primary">Add</span>}
                />
              ))}
            </ListGroup>
          </div>
        )}

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
