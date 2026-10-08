import { useEffect, useState } from 'react'
import { Copy, Share2 } from 'lucide-react'
import { changeGroupPin, createGroupForCurrentHost, getMyGroup } from '../../lib/groupAuth'
import { getOrCreateOwnEntity } from '../../lib/entities'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { Switch } from './switch'
import { toast } from '../../lib/toast'
import {
  ensureHostInvite,
  hostInviteUrl,
  myInvitedHosts,
  setHostPaused,
  type InvitedHost,
} from '../../lib/hostInvites'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './sheet'
import { Button } from './button'
import { Input } from './input'
import { Label } from './label'

// MVP 2.0 settings for a host: the group ID (so it is easy to find) and a
// way to change the PIN. With the ID and PIN a host gets back in on a new
// phone, see supabase/functions/group-login.
export function GroupSettingsSheet({
  open,
  onOpenChange,
  onGroupChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onGroupChange?: (hasGroup: boolean) => void
}) {
  const [group, setGroup] = useState<{ group_id: string; name: string | null } | null | undefined>(undefined)
  const [pin, setPin] = useState('')
  const [saving, setSaving] = useState(false)
  const { profile } = useAuth()
  const [isClub, setIsClub] = useState(false)
  const [invited, setInvited] = useState<InvitedHost[]>([])

  useEffect(() => {
    if (!open) return
    setPin('')
    myInvitedHosts()
      .then(setInvited)
      .catch(() => {})
    getMyGroup()
      .then(setGroup)
      .catch(() => setGroup(null))
    if (profile) {
      supabase
        .from('hosting_entities')
        .select('type')
        .eq('owner_profile_id', profile.id)
        .maybeSingle()
        .then(({ data }) => setIsClub(data?.type === 'club'))
    }
  }, [open, profile])

  // Players see houses and clubs in separate tabs in their book.
  async function toggleClub(next: boolean) {
    if (!profile) return
    setIsClub(next)
    try {
      const entity = await getOrCreateOwnEntity(profile)
      const { error } = await supabase
        .from('hosting_entities')
        .update({ type: next ? 'club' : 'house' })
        .eq('id', entity.id)
      if (error) throw error
      toast.success(next ? 'Marked as a club' : 'Marked as a house game')
    } catch {
      setIsClub(!next)
      toast.error('Could not save that')
    }
  }

  async function sendInvite() {
    try {
      const url = hostInviteUrl(await ensureHostInvite())
      const text = `Run your own game nights on Straddle. Open this to get started:\n${url}`
      if (navigator.share) {
        await navigator.share({ title: 'Host on Straddle', text }).catch(() => {})
      } else {
        await navigator.clipboard.writeText(text)
        toast.success('Invite copied')
      }
    } catch {
      toast.error('Could not make the invite link')
    }
  }

  async function togglePaused(h: InvitedHost) {
    try {
      await setHostPaused(h.host_id, !h.paused)
      setInvited((list) => list.map((x) => (x.host_id === h.host_id ? { ...x, paused: !h.paused } : x)))
      toast.success(h.paused ? `${h.name} can host again` : `${h.name} is paused`)
    } catch {
      toast.error('Could not change that')
    }
  }

  async function copyId() {
    if (!group) return
    try {
      await navigator.clipboard.writeText(group.group_id)
      toast.success('Group ID copied')
    } catch {
      toast.error('Could not copy')
    }
  }

  // Existing host with no group yet: one PIN, and the group ID appears.
  async function createGroup() {
    if (!/^[0-9]{4}$/.test(pin)) {
      toast.error('PIN must be 4 digits')
      return
    }
    setSaving(true)
    try {
      await createGroupForCurrentHost('', pin)
      setGroup(await getMyGroup())
      onGroupChange?.(true)
      setPin('')
      toast.success('Your group ID is ready')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not set up your group ID')
    } finally {
      setSaving(false)
    }
  }

  async function savePin() {
    if (!/^[0-9]{4}$/.test(pin)) {
      toast.error('PIN must be 4 digits')
      return
    }
    setSaving(true)
    try {
      await changeGroupPin(pin)
      toast.success('PIN changed')
      setPin('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change the PIN')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Group &amp; sign-in</SheetTitle>
          <SheetDescription>
            To get back in on a new phone, sign in with your group ID and PIN.
          </SheetDescription>
        </SheetHeader>

        {group === undefined ? null : group === null ? (
          <>
            <p className="mt-4 text-sm text-body">
              Pick a 4-digit PIN to get your group ID. Nothing else changes, and you stay signed in.
            </p>
            <div className="mt-4 flex flex-col gap-1.5">
              <Label htmlFor="settings-newpin">Choose a PIN</Label>
              <Input
                id="settings-newpin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                className="h-12 tracking-[0.5em]"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <Button block className="mt-3" disabled={saving || pin.length !== 4} onClick={createGroup}>
              {saving ? 'Setting up…' : 'Get my group ID'}
            </Button>
          </>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between rounded-md border border-hairline bg-surface-soft px-4 py-3">
              <div>
                <p className="type-label-caption text-muted">Group ID</p>
                <p className="mt-1 text-xl font-bold tracking-widest text-primary">{group.group_id}</p>
              </div>
              <button
                type="button"
                aria-label="Copy group ID"
                onClick={copyId}
                className="flex h-10 w-10 items-center justify-center rounded-sm border border-hairline text-muted hover:bg-surface-strong"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>

            <label className="mt-5 flex items-center justify-between gap-3 rounded-md border border-hairline p-3">
              <span>
                <span className="block text-sm font-semibold text-ink">This is a club</span>
                <span className="block text-xs text-muted">Players see it under Clubs, not Houses.</span>
              </span>
              <Switch checked={isClub} onCheckedChange={toggleClub} />
            </label>

            <div className="mt-5 rounded-md border border-hairline p-3">
              <p className="text-sm font-semibold text-ink">Invite a host</p>
              <p className="mt-0.5 text-xs text-muted">
                A friend who opens your link starts their own group. Their players and results stay theirs; you see
                their games here and can pause them.
              </p>
              <Button variant="secondary" block className="mt-3" onClick={sendInvite}>
                <Share2 className="mr-1.5 h-4 w-4" /> Send invite link
              </Button>
              {invited.length > 0 && (
                <ul className="mt-3 divide-y divide-hairline">
                  {invited.map((h) => (
                    <li key={h.host_id} className="flex items-center gap-3 py-2.5">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">
                          {h.group ?? h.name}
                          {h.paused ? ' · paused' : ''}
                        </span>
                        <span className="block text-xs text-muted">
                          {h.name} · {h.games} game{h.games === 1 ? '' : 's'} · {h.players} player
                          {h.players === 1 ? '' : 's'}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => togglePaused(h)}
                        className="cta-soft text-xs font-semibold text-muted hover:text-ink"
                      >
                        {h.paused ? 'Resume' : 'Pause'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-5 flex flex-col gap-1.5">
              <Label htmlFor="settings-pin">Change PIN</Label>
              <Input
                id="settings-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                className="h-12 tracking-[0.5em]"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <Button block className="mt-3" disabled={saving || pin.length !== 4} onClick={savePin}>
              {saving ? 'Saving…' : 'Save new PIN'}
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
