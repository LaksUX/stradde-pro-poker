import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { changeGroupPin, getMyGroup } from '../../lib/groupAuth'
import { toast } from '../../lib/toast'
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [group, setGroup] = useState<{ group_id: string; name: string | null } | null | undefined>(undefined)
  const [pin, setPin] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setPin('')
    getMyGroup()
      .then(setGroup)
      .catch(() => setGroup(null))
  }, [open])

  async function copyId() {
    if (!group) return
    try {
      await navigator.clipboard.writeText(group.group_id)
      toast.success('Group ID copied')
    } catch {
      toast.error('Could not copy')
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
          <p className="mt-4 text-sm text-muted">
            This account has no group ID yet. Sign out and start a group to get one.
          </p>
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
