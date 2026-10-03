import * as React from "react"
import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { cn } from "cn"
import { useCountUp } from "../../hooks/useCountUp"

type Tone = "auto" | "neutral" | "win" | "error"

// A big, count-up number with a caption and an optional trend line. Library-
// free take on the stat-card pattern: the figure animates from 0 when the card
// appears, and `signed` + tone="auto" colors it green/red by its sign.
// `value` is the already-converted display number (chips/count), not banks.
function StatCard({
  title,
  value,
  signed = false,
  suffix,
  tone = "neutral",
  hero = false,
  trend,
  animate = true,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode
  value: number
  signed?: boolean
  suffix?: string
  tone?: Tone
  hero?: boolean
  trend?: { amount: number; label: string }
  animate?: boolean
}) {
  const animated = useCountUp(animate ? value : 0, animate ? 900 : 0)
  const shown = animate ? animated : value

  const resolved: Exclude<Tone, "auto"> =
    tone === "auto" ? (value > 0 ? "win" : value < 0 ? "error" : "neutral") : tone
  const toneClass =
    resolved === "win" ? "text-win" : resolved === "error" ? "text-error" : "text-ink"
  const text =
    (signed && shown > 0 ? "+" : shown < 0 ? "−" : "") + Math.abs(shown).toLocaleString("en-US")

  const trendUp = trend ? trend.amount >= 0 : true
  const trendText = trend
    ? `${trend.amount > 0 ? "+" : trend.amount < 0 ? "−" : ""}${Math.abs(trend.amount).toLocaleString("en-US")}`
    : ""

  return (
    <div
      data-slot="stat-card"
      role="group"
      aria-label={`${typeof title === "string" ? title : "Stat"}: ${value.toLocaleString("en-US")}${suffix ?? ""}`}
      className={cn(
        "bg-card text-card-foreground flex flex-col items-center gap-2 rounded-lg p-5 text-center",
        className
      )}
      {...props}
    >
      <p className="type-label-caption text-muted">{title}</p>
      <p className={cn("flex items-baseline justify-center gap-1", hero ? "type-figure-hero" : "type-figure-md", toneClass)}>
        <span aria-hidden>{text}</span>
        {suffix && (
          <span className={cn("font-semibold text-muted", hero ? "text-2xl" : "text-sm")}>{suffix}</span>
        )}
      </p>
      {trend && (
        <p className="mt-1 flex items-center gap-2 text-sm text-muted">
          <span
            className={cn(
              "flex items-center justify-center rounded-full p-1",
              trendUp ? "bg-win/15 text-win" : "bg-error/15 text-error"
            )}
          >
            {trendUp ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          </span>
          <span>
            <span className={cn("font-semibold", trendUp ? "text-win" : "text-error")}>{trendText}</span>{" "}
            {trend.label}
          </span>
        </p>
      )}
      {children}
    </div>
  )
}

export { StatCard }
