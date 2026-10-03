import { useEffect, useState } from 'react'
import { Copy, Share2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { cardUrl } from '../../lib/playerCard'
import { confirmDialog } from '../../lib/confirmDialog'
import { toast } from '../../lib/toast'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './sheet'
import { ListGroup, ListRow } from './list-row'
import { NamedAvatar } from './avatar'

type CardPlayer = { profile_id: string; full_name: string }

// MVP 2.0: each player's permanent card link. Opening the sheet creates any
// missing cards (ensure_player_card, migration 0022) and lists one row per
// player to copy or share. "New link" replaces the token and kills the old one.
export function PlayerCardsSheet({
  open,
  onOpenChange,
  gameId,
  players,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  gameId: string
  players: CardPlayer[]
}) {
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState(false)
  const idsKey = players.map((p) => p.profile_id).join(',')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setFailed(false)
    Promise.all(
      players.map(async (p) => {
        const { data, error } = await supabase.rpc('ensure_player_card', {
          p_game_id: gameId,
          p_profile_id: p.profile_id,
        })
        if (error) throw error
        return [p.profile_id, data as string] as const
      })
    )
      .then((pairs) => !cancelled && setTokens(Object.fromEntries(pairs)))
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, gameId, idsKey])

  async function copy(profileId: string) {
    const t = tokens[profileId]
    if (!t) return
    try {
      await navigator.clipboard.writeText(cardUrl(t))
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy the link')
    }
  }

  async function share(p: CardPlayer) {
    const t = tokens[p.profile_id]
    if (!t) return
    const url = cardUrl(t)
    if (navigator.share) {
      try {
        await navigator.share({ title: `${p.full_name}'s card`, url })
      } catch {
        // user dismissed the share sheet
      }
    } else {
      await copy(p.profile_id)
    }
  }

  async function regenerate(p: CardPlayer) {
    const ok = await confirmDialog(`Make a new link for ${p.full_name}? Their old link stops working.`, {
      confirmLabel: 'Make new link',
      danger: true,
    })
    if (!ok) return
    const { data, error } = await supabase.rpc('ensure_player_card', {
      p_game_id: gameId,
      p_profile_id: p.profile_id,
      p_regenerate: true,
    })
    if (error) {
      toast.error('Could not make a new link')
      return
    }
    setTokens((t) => ({ ...t, [p.profile_id]: data as string }))
    toast.success('New link ready')
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Player cards</SheetTitle>
          <SheetDescription>
            One permanent link per player. Their nights appear on it automatically.
          </SheetDescription>
        </SheetHeader>
        {failed && (
          <p className="mt-4 text-center text-sm text-error">
            Couldn't load the card links. Check the connection and try again.
          </p>
        )}
        <ListGroup className="mt-4">
          {players.map((p) => (
            <ListRow
              key={p.profile_id}
              avatar={<NamedAvatar name={p.full_name} className="h-10 w-10" />}
              title={p.full_name}
              subtitle={
                tokens[p.profile_id] ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-muted hover:text-ink"
                    onClick={() => regenerate(p)}
                  >
                    New link
                  </button>
                ) : (
                  'Preparing…'
                )
              }
              trailing={
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label={`Copy ${p.full_name}'s link`}
                    disabled={!tokens[p.profile_id]}
                    onClick={() => copy(p.profile_id)}
                    className="flex h-9 w-9 items-center justify-center rounded-sm border border-hairline text-muted hover:bg-surface-strong disabled:opacity-40"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Share ${p.full_name}'s link`}
                    disabled={!tokens[p.profile_id]}
                    onClick={() => share(p)}
                    className="flex h-9 w-9 items-center justify-center rounded-sm bg-primary text-on-primary hover:bg-primary-active disabled:opacity-40"
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                </div>
              }
            />
          ))}
        </ListGroup>
      </SheetContent>
    </Sheet>
  )
}
