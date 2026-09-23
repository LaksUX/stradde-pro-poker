import { cn } from "cn"

// Shared line-chart primitive — every per-game trend in the app (lifetime
// net, venue buy-ins) uses this same shape now instead of each screen
// hand-rolling its own bar/line SVG. Deliberately not a real charting
// library: this session can reach npm but not a registry that would host a
// shadcn chart recipe, and a handful of points never needs more than plain
// inline SVG.
function LineChart({
  points,
  height = 64,
  colorBySign = false,
  className,
}: {
  points: number[]
  height?: number
  colorBySign?: boolean
  className?: string
}) {
  if (points.length === 0) return null
  const width = Math.max(points.length * 28, 28)
  const max = Math.max(...points, 0)
  const min = Math.min(...points, 0)
  const range = Math.max(max - min, 1)
  const pad = 10
  const toY = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2)
  const toX = (i: number) => (points.length === 1 ? width / 2 : i * 28 + 14)
  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i)},${toY(v)}`).join(' ')
  const hasZeroCrossing = min < 0 && max > 0

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('w-full', className)}
      role="img"
    >
      {hasZeroCrossing && (
        <line x1={0} y1={toY(0)} x2={width} y2={toY(0)} className="stroke-hairline-soft" strokeWidth={1} />
      )}
      <path d={path} fill="none" className="stroke-primary" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((v, i) => (
        <circle
          key={i}
          cx={toX(i)}
          cy={toY(v)}
          r={3}
          className={colorBySign ? (v >= 0 ? 'fill-win' : 'fill-error') : 'fill-primary'}
        />
      ))}
    </svg>
  )
}

export { LineChart }
