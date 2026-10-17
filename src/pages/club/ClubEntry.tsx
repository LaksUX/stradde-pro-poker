import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { enterDemo, type ClubRole } from '../../lib/club'
import { toast } from '../../lib/toast'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'

const ROLES: { role: ClubRole; label: string; note: string }[] = [
  { role: 'owner', label: 'Owner', note: 'Everything, including the audit log' },
  { role: 'manager', label: 'Floor manager', note: 'Open and close tables, verify members, void entries' },
  { role: 'cashier', label: 'Cashier', note: 'Seat members, record buy-ins and cash-outs' },
]

// Prototype entry: pick a demo club and a role to step into. Real staff
// sign-in replaces this once the flow is agreed.
export function ClubEntry() {
  const navigate = useNavigate()
  const [slot, setSlot] = useState<'A' | 'B'>('A')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<ClubRole | null>(null)

  async function go(role: ClubRole) {
    setBusy(role)
    try {
      await enterDemo(slot, role, name || ROLES.find((r) => r.role === role)!.label)
      navigate('/club/home', { replace: true })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not enter the demo')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm p-4 sm:p-6">
      <p className="type-label-caption text-muted">MVP Club · prototype</p>
      <h1 className="mt-1 text-3xl font-bold text-ink">Step into a demo club</h1>
      <p className="mt-2 text-sm text-muted">Demo data only. Choose a club and a role to see what that person can do.</p>

      <div className="mt-6 grid grid-cols-2 gap-2">
        {(['A', 'B'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSlot(s)}
            className={
              slot === s
                ? 'rounded-lg border border-primary bg-primary py-3 text-sm font-semibold text-on-primary'
                : 'rounded-lg border border-hairline bg-canvas py-3 text-sm font-semibold text-ink'
            }
          >
            Demo Club {s}
          </button>
        ))}
      </div>

      <Input className="mt-3 h-12" placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)} />

      <div className="mt-4 space-y-2">
        {ROLES.map((r) => (
          <Button key={r.role} variant="secondary" block disabled={busy !== null} onClick={() => go(r.role)} className="h-auto flex-col items-start gap-0.5 py-3">
            <span className="text-base font-semibold">{busy === r.role ? 'Entering…' : `Enter as ${r.label}`}</span>
            <span className="text-xs font-normal text-muted">{r.note}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}
