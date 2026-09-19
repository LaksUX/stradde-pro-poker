// DESIGN-dashboard.md's stat-card + delta-badge: an uppercase eyebrow label,
// a large monospace hero figure, and an optional colored delta line beneath
// it. Used wherever a screen has one number it exists to show — net chips,
// a settlement total, lifetime net.
export function StatCard({
  eyebrow,
  value,
  delta,
  valueClassName = '',
  children,
}: {
  eyebrow: string
  value: string
  delta?: { positive: boolean; label: string }
  valueClassName?: string
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{eyebrow}</p>
      <p className={`mt-2 font-mono text-4xl font-bold tabular-nums text-ink ${valueClassName}`}>{value}</p>
      {delta && (
        <p className={`mt-2 flex items-center gap-1 text-sm font-semibold ${delta.positive ? 'text-win' : 'text-error'}`}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className={delta.positive ? '' : 'rotate-180'}
          >
            <path d="M6 18L18 6M18 6H9M18 6v9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {delta.label}
        </p>
      )}
      {children}
    </div>
  )
}
