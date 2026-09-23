import { cn } from "cn"

// Bar-chart sibling to line-chart.tsx's LineChart — same points-in,
// svg-out shape, same zero-baseline treatment, different mark. Home's
// Player tab uses this one for lifetime net; everywhere else that wants a
// trend keeps using LineChart.
function BarChart({
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
  const barWidth = 16
  const gap = 12
  const width = Math.max(points.length * (barWidth + gap), barWidth)
  const max = Math.max(...points, 0)
  const min = Math.min(...points, 0)
  const range = Math.max(max - min, 1)
  const pad = 6
  const toY = (v: number) => height - pad - ((v - min) / range) * (height - pad * 2)
  const zeroY = toY(0)
  const toX = (i: number) => i * (barWidth + gap) + gap / 2

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('w-full', className)}
      role="img"
    >
      {min < 0 && max > 0 && (
        <line x1={0} y1={zeroY} x2={width} y2={zeroY} className="stroke-hairline-soft" strokeWidth={1} />
      )}
      {points.map((v, i) => {
        const y = Math.min(toY(v), zeroY)
        const barHeight = Math.max(Math.abs(toY(v) - zeroY), 2)
        return (
          <rect
            key={i}
            x={toX(i)}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={3}
            className={colorBySign ? (v >= 0 ? 'fill-win' : 'fill-error') : 'fill-primary'}
          />
        )
      })}
    </svg>
  )
}

export { BarChart }
