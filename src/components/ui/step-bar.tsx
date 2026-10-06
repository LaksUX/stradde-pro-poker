import { Check } from "lucide-react"
import { cn } from "cn"

const STEPS = ["Play", "Cash out", "Settle", "Share"] as const

// The night as four fixed steps. `current` is 1-4; earlier steps show a tick.
function StepBar({ current, className }: { current: 1 | 2 | 3 | 4; className?: string }) {
  return (
    <ol
      aria-label={`Step ${current} of 4: ${STEPS[current - 1]}`}
      className={cn("flex items-start", className)}
    >
      {STEPS.map((label, i) => {
        const n = i + 1
        const done = n < current
        const active = n === current
        return (
          <li key={label} className="relative flex flex-1 flex-col items-center gap-1">
            {i > 0 && (
              <span
                aria-hidden
                className={cn(
                  "absolute top-3 right-1/2 h-0.5 w-full -translate-y-1/2",
                  n <= current ? "bg-primary" : "bg-hairline"
                )}
              />
            )}
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                done && "bg-primary text-on-primary",
                active && "bg-primary text-on-primary ring-4 ring-primary/20",
                !done && !active && "border border-hairline bg-canvas text-muted"
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : n}
            </span>
            <span className={cn("text-[12.5px] font-semibold", active ? "text-ink" : "text-muted")}>{label}</span>
          </li>
        )
      })}
    </ol>
  )
}

export { StepBar }
