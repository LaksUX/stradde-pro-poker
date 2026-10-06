import { useEffect, useId, useRef, useState } from "react"
import { cn } from "cn"

// Catmull-Rom to cubic Bezier: a smooth curve that still passes exactly
// through every data point, with no kinks at them.
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ""
  if (pts.length === 1) return `M${pts[0]!.x},${pts[0]!.y}`
  if (pts.length === 2) return `M${pts[0]!.x},${pts[0]!.y} L${pts[1]!.x},${pts[1]!.y}`
  const d = [`M${pts[0]!.x},${pts[0]!.y}`]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    const p3 = pts[i + 2] ?? p2
    d.push(
      `C${p1.x + (p2.x - p0.x) / 6},${p1.y + (p2.y - p0.y) / 6} ` +
        `${p2.x - (p3.x - p1.x) / 6},${p2.y - (p3.y - p1.y) / 6} ${p2.x},${p2.y}`
    )
  }
  return d.join(" ")
}

const defaultFormat = (v: number) => Math.round(v).toLocaleString("en-US")

// The app's one trend chart. Drawn at the real pixel width of its container
// (no stretching, so text and dots stay a normal size), with a soft area under
// the line, a dashed zero line when the data crosses zero, thinned date
// labels, and tap-or-drag to read any point.
function LineChart({
  points,
  labels,
  height = 140,
  colorBySign = false,
  format = defaultFormat,
  className,
}: {
  points: number[]
  labels?: string[]
  height?: number
  colorBySign?: boolean
  format?: (v: number) => string
  className?: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(300)
  const [active, setActive] = useState<number | null>(null)
  const gradId = useId().replace(/:/g, "")

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const set = () => setWidth(Math.max(120, Math.round(el.clientWidth)))
    set()
    if (typeof ResizeObserver === "undefined") return
    const ro = new ResizeObserver(set)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  if (points.length === 0) return null

  const hasLabels = !!labels && labels.length === points.length
  const padX = 14
  const padTop = 22
  const labelH = hasLabels ? 22 : 8
  const plotH = height - padTop - labelH
  const max = Math.max(...points, 0)
  const min = Math.min(...points, 0)
  const range = Math.max(max - min, 1)
  const toY = (v: number) => padTop + (1 - (v - min) / range) * plotH
  const innerW = width - padX * 2
  const toX = (i: number) => (points.length === 1 ? width / 2 : padX + (i / (points.length - 1)) * innerW)
  const coords = points.map((v, i) => ({ x: toX(i), y: toY(v) }))
  const line = smoothPath(coords)
  const baseY = toY(Math.max(min, 0) === 0 ? 0 : min)
  const area = `${line} L${coords[coords.length - 1]!.x},${baseY} L${coords[0]!.x},${baseY} Z`
  const crossesZero = min < 0 && max > 0
  const last = points[points.length - 1]!
  const tone = colorBySign ? (last >= 0 ? "var(--color-win)" : "var(--color-error)") : "var(--color-primary)"

  // Label thinning: keep roughly 64px between printed labels, always the first
  // and last.
  const step = Math.max(1, Math.ceil(64 / Math.max(innerW / Math.max(points.length - 1, 1), 1)))
  const showLabel = (i: number) =>
    i === 0 || i === points.length - 1 || (i % step === 0 && i >= step && points.length - 1 - i >= step)

  function pick(clientX: number) {
    const el = wrapRef.current
    if (!el) return
    const x = clientX - el.getBoundingClientRect().left
    let best = 0
    let dist = Infinity
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - x)
      if (d < dist) {
        dist = d
        best = i
      }
    })
    setActive(best)
  }

  const showAt = active ?? points.length - 1
  const tip = coords[showAt]!
  const tipText = format(points[showAt]!)
  const tipW = Math.max(44, tipText.length * 7.5 + 16)
  const tipX = Math.min(Math.max(tip.x, tipW / 2 + 2), width - tipW / 2 - 2)

  return (
    <div
      ref={wrapRef}
      className={cn("w-full touch-pan-y select-none", className)}
      onPointerDown={(e) => pick(e.clientX)}
      onPointerMove={(e) => e.buttons > 0 || e.pointerType === "mouse" ? pick(e.clientX) : undefined}
      onPointerLeave={() => setActive(null)}
    >
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Trend of ${points.length} points, latest ${format(last)}`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tone} stopOpacity="0.22" />
            <stop offset="100%" stopColor={tone} stopOpacity="0" />
          </linearGradient>
        </defs>

        {crossesZero && (
          <line
            x1={padX}
            x2={width - padX}
            y1={toY(0)}
            y2={toY(0)}
            stroke="var(--color-border-strong)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        )}

        {points.length > 1 && <path d={area} fill={`url(#${gradId})`} />}
        <path d={line} fill="none" stroke={tone} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {points.length <= 14 &&
          coords.map((c, i) => (
            <circle key={i} cx={c.x} cy={c.y} r={i === showAt ? 5 : 3} fill="var(--color-canvas)" stroke={tone} strokeWidth={2} />
          ))}
        {points.length > 14 && <circle cx={tip.x} cy={tip.y} r={5} fill="var(--color-canvas)" stroke={tone} strokeWidth={2} />}

        <line x1={tip.x} x2={tip.x} y1={padTop - 4} y2={padTop + plotH} stroke={tone} strokeOpacity={0.25} strokeWidth={1} />
        <g>
          <rect x={tipX - tipW / 2} y={0} width={tipW} height={20} rx={10} fill={tone} />
          <text x={tipX} y={14} textAnchor="middle" fill="white" fontSize={12} fontWeight={700}>
            {tipText}
          </text>
        </g>

        {hasLabels &&
          labels!.map((l, i) =>
            showLabel(i) ? (
              <text
                key={i}
                x={i === 0 ? padX : i === points.length - 1 ? width - padX : coords[i]!.x}
                y={height - 6}
                textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
                fontSize={11}
                fill="var(--color-muted)"
              >
                {l}
              </text>
            ) : null
          )}
      </svg>
    </div>
  )
}

export { LineChart }
