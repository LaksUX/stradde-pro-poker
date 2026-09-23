import { cn } from "cn"

// Catmull-Rom → cubic Bézier: draws a smooth curve through every point
// (not just a fitted approximation) — each segment's control points are
// derived from its neighbors, so the line still passes exactly through
// each data point, it just doesn't kink at them.
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M${pts[0]!.x},${pts[0]!.y}`
  if (pts.length === 2) return `M${pts[0]!.x},${pts[0]!.y} L${pts[1]!.x},${pts[1]!.y}`
  const d = [`M${pts[0]!.x},${pts[0]!.y}`]
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!
    const p1 = pts[i]!
    const p2 = pts[i + 1]!
    const p3 = pts[i + 2] ?? p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d.push(`C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`)
  }
  return d.join(' ')
}

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
  const coords = points.map((v, i) => ({ x: toX(i), y: toY(v) }))
  const path = smoothPath(coords)
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
