import { useCallback, useEffect, useState } from 'react'
import { Copy, Share2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { runWrite } from '../../lib/errors'
import { confirmDialog } from '../../lib/confirmDialog'
import { toast } from '../../lib/toast'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './sheet'
import { Button } from './button'
import { ListGroup, ListRow } from './list-row'
import { NamedAvatar } from './avatar'
import { InviteQrCard } from './invite-qr-card'

type Manager = { profile_id: string; full_name: string }

// Co-hosts for a live game: see who is managing, remove them, and invite a new
// one with a link or QR. Removing + inviting is how a manager is swapped
// mid-game. Original host only. See 0024_manager_invites.sql.
export function ManagersSheet({
  open,
  onOpenChange,
  gameId,
  gameName,
  closed,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  gameId: string
  gameName: string
  closed: boolean
}) {
  const [managers, setManagers] = useState<Manager[]>([])
  const [token, setToken] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadManagers = useCallback(async () => {
    const { data } = await supabase.rpc('get_game_managers', { p_game_id: gameId })
    setManagers((data ?? []) as Manager[])
  }, [gameId])

  const loadInvite = useCallback(
    async (replace: boolean) => {
      setBusy(true)
      const { data, error } = await supabase.rpc('get_manager_invite', {
        p_game_id: gameId,
        p_replace: replace,
      })
      setBusy(false)
      if (error) {
        toast.error(error.message)
        return
      }
      setToken(data as string)
    },
    [gameId]
  )

  useEffect(() => {
    if (!open) return
    loadManagers()
    if (!closed) loadInvite(false)
  }, [open, closed, loadManagers, loadInvite])

  const url = token ? `${window.location.origin}/m/${token}` : ''

  async function remove(m: Manager) {
    const ok = await confirmDialog(`Remove ${m.full_name} as co-host? They lose access right away.`, {
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    const done = await runWrite(
      () => supabase.from('game_managers').delete().eq('game_id', gameId).eq('profile_id', m.profile_id),
      'Removing co-host'
    )
    if (done) loadManagers()
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.error('Could not copy the link')
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Co-host ${gameName}`, url })
      } catch {
        // dismissed
      }
    } else {
      await copy()
    }
  }

  async function newLink() {
    const ok = await confirmDialog('Make a new co-host link? The old link stops working.', {
      confirmLabel: 'New link',
    })
    if (ok) loadInvite(true)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Co-hosts</SheetTitle>
          <SheetDescription>
            A co-host can approve buy-ins and enter cash-outs for this game. To swap one, remove them and send
            the link to someone else.
          </SheetDescription>
        </SheetHeader>

        {managers.length > 0 ? (
          <ListGroup className="mt-4">
            {managers.map((m) => (
              <ListRow
                key={m.profile_id}
                avatar={<NamedAvatar name={m.full_name} className="h-10 w-10" />}
                title={m.full_name}
                trailing={
                  <Button size="sm" variant="outline" onClick={() => remove(m)}>
                    Remove
                  </Button>
                }
              />
            ))}
          </ListGroup>
        ) : (
          <p className="mt-4 text-center text-sm text-muted">No co-host yet.</p>
        )}

        {!closed && (
          <div className="mt-5">
            <h3 className="type-label-caption mb-2 text-muted">Invite a co-host</h3>
            {token ? (
              <>
                <InviteQrCard eyebrow="Co-host link" title={gameName} url={url} />
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" block onClick={copy}>
                    <Copy className="mr-2 h-4 w-4" /> Copy
                  </Button>
                  <Button block onClick={share}>
                    <Share2 className="mr-2 h-4 w-4" /> Send
                  </Button>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={newLink}
                  className="cta-soft mt-3 w-full py-2.5 text-xs font-semibold text-muted hover:text-ink"
                >
                  Make a new link
                </button>
              </>
            ) : (
              <p className="text-center text-sm text-muted">Preparing the link…</p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
