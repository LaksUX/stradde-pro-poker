import { Clock } from "lucide-react"
import { cn } from "cn"

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

// A shadcn-styled stand-in for a time input — Base UI has no dedicated time
// picker part, and the native <input type="time"> renders as the browser's
// own unstyled widget (the thing this replaces). Two plain <select>s inside
// one bordered shell reads as one control, matches the app's existing
// hour/minute grain, and needs no extra library.
function TimePicker({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const [hStr, mStr] = value.split(':')
  const hour = Number(hStr) || 0
  const minute = Number(mStr) || 0

  function set(nextHour: number, nextMinute: number) {
    onChange(`${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`)
  }

  return (
    <div
      className={cn(
        "flex h-14 items-center gap-1.5 rounded-sm border border-hairline bg-surface-strong px-3 text-sm text-ink",
        className
      )}
    >
      <Clock className="h-4 w-4 shrink-0 text-muted" />
      <select
        aria-label="Hour"
        value={hour}
        onChange={(e) => set(Number(e.target.value), minute)}
        className="bg-transparent text-sm text-ink outline-none"
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {String(h).padStart(2, '0')}
          </option>
        ))}
      </select>
      <span className="text-muted">:</span>
      <select
        aria-label="Minute"
        value={minute}
        onChange={(e) => set(hour, Number(e.target.value))}
        className="bg-transparent text-sm text-ink outline-none"
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {String(m).padStart(2, '0')}
          </option>
        ))}
      </select>
    </div>
  )
}

export { TimePicker }
