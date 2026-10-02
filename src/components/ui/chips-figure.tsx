import { toChips, type ChipRatio } from '../../lib/chips'
import { cn } from 'cn'

// The one place a chips amount is ever rendered as a figure. Win/loss color
// (and an optional leading icon) belongs to the NUMBER only — "chips" is
// always plain muted text at the smaller size, never colored or
// emphasized, so a green/red figure never reads as if the unit itself is
// what changed. `amount` is banks (the stored unit); conversion happens
// here, same as everywhere else in the app.
export function ChipsFigure({
  amount,
  ratio,
  tone = 'neutral',
  icon,
  size = 'md',
  className,
}: {
  amount: number
  ratio: ChipRatio
  tone?: 'win' | 'error' | 'neutral'
  icon?: React.ReactNode
  size?: 'md' | 'hero'
  className?: string
}) {
  const colorClass = tone === 'win' ? 'text-win' : tone === 'error' ? 'text-error' : 'text-ink'
  const sizeClass = size === 'hero' ? 'type-figure-hero' : 'type-figure-md'
  return (
    <span className={cn('inline-flex items-baseline gap-1 whitespace-nowrap', className)}>
      <span className={cn('inline-flex items-center gap-1', sizeClass, colorClass)}>
        {icon}
        {toChips(amount, ratio)}
      </span>
      <span className="text-sm text-muted">chips</span>
    </span>
  )
}
