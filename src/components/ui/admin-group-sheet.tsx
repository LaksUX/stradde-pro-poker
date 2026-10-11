import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { confirmDialog } from '../../lib/confirmDialog'
import { toast } from '../../lib/toast'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './sheet'
import { Button } from './button'
import { Input } from './input'
import { Label } from './label'

export type GroupRef = { host_id: string; name: string | null; group_name: string | null; group_id: string | null }

// Admin: edit a group (name, PIN reset) or merge it into another group.
export function AdminGroupSheet({
  host,
  others,
  onClose,
  onChanged,
}: {
  host: GroupRef | null
  others: GroupRef[]
  onClose: () => void
  onChanged: () => void
}) {
  const [name, setName] = useState('')
  const [pin, setPin] = useState('')
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const [gameName, setGameName] = useState('')
  const [ratio, setRatio] = useState<'1:1' | '1:2'>('1:1')

  useEffect(() => {
    if (!host) return
    setName(host.group_name ?? '')
    setPin('')
    setTarget('')
    setGameName('')
    setRatio('1:1')
  }, [host])

  if (!host) return null
  const label = (g: GroupRef) => g.group_name ?? g.name ?? 'Unnamed'

  async function save() {
    if (pin !== '' && !/^[0-9]{4}$/.test(pin)) {
      toast.error('PIN must be 4 digits')
      return
    }
    setBusy(true)
    const { error } = await supabase.rpc('admin_update_group', {
      p_host: host!.host_id,
      p_name: name,
      p_pin: pin || null,
    })
    setBusy(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Group updated')
    onChanged()
    onClose()
  }

  async function addGame() {
    if (!gameName.trim()) {
      toast.error('Name the game first')
      return
    }
    setBusy(true)
    const { data, error } = await supabase.rpc('admin_create_game', {
      p_host: host!.host_id,
      p_name: gameName,
      p_chip_ratio: ratio,
    })
    setBusy(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Game started')
    onChanged()
    onClose()
    navigate(`/games/${data as string}/live`)
  }

  async function merge() {
    const into = others.find((o) => o.host_id === target)
    if (!into) return
    const ok = await confirmDialog(
      `Merge ${label(host!)} into ${label(into)}? All its games and player cards move to ${label(into)}, and ${label(host!)} is retired. This cannot be undone.`,
      { confirmLabel: 'Merge groups', danger: true }
    )
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.rpc('admin_merge_groups', { p_from: host!.host_id, p_into: into.host_id })
    setBusy(false)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Groups merged')
    onChanged()
    onClose()
  }

  return (
    <Sheet open={host != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{label(host)}</SheetTitle>
          <SheetDescription>
            {host.name}
            {host.group_id ? ` · Group ID ${host.group_id}` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-1.5">
          <Label htmlFor="adm-group-name">Group name</Label>
          <Input id="adm-group-name" className="h-12" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <Label htmlFor="adm-group-pin">Reset PIN (optional)</Label>
          <Input
            id="adm-group-pin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            className="h-12 tracking-[0.5em]"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <Button block className="mt-4" disabled={busy || !host.group_id} onClick={save}>
          Save changes
        </Button>

        <div className="mt-6 border-t border-hairline-soft pt-4">
          <p className="type-label-caption text-muted">Add a game to this group</p>
          <div className="mt-3 flex flex-col gap-1.5">
            <Label htmlFor="adm-game-name">Game name</Label>
            <Input
              id="adm-game-name"
              className="h-12"
              placeholder="Friday night"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-full bg-surface-strong/70 p-1">
            {(['1:1', '1:2'] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRatio(r)}
                className={`rounded-full py-2 text-sm font-semibold ${ratio === r ? 'bg-canvas text-ink shadow-sm' : 'text-muted'}`}
              >
                {r}
              </button>
            ))}
          </div>
          <Button variant="secondary" block className="mt-3" disabled={busy} onClick={addGame}>
            Start game
          </Button>
        </div>

        {others.length > 0 && (
          <div className="mt-6 border-t border-hairline-soft pt-4">
            <p className="type-label-caption text-muted">Merge into another group</p>
            <p className="mt-1 text-xs text-muted">
              Moves every game and player card here into the group you pick, then retires this one.
            </p>
            <select
              aria-label="Merge into"
              className="mt-3 h-12 w-full rounded-md border border-hairline bg-surface-soft px-3 text-base text-ink"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choose a group…</option>
              {others.map((o) => (
                <option key={o.host_id} value={o.host_id}>
                  {label(o)}
                  {o.name && o.group_name ? ` (${o.name})` : ''}
                </option>
              ))}
            </select>
            <Button variant="secondary" block className="mt-3" disabled={busy || !target} onClick={merge}>
              Merge groups
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
