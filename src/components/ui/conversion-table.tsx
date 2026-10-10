import { toChips, valueFactor, type ChipRatio } from '../../lib/chips'

// 1:2 tables only: the typed chip count and what it is worth, with a legend.
// At 1:1 chips equal value, so nothing is shown.
export function ConversionTable({ cashoutBanks, ratio }: { cashoutBanks: number; ratio: ChipRatio }) {
  const f = valueFactor(ratio)
  if (f === 1) return null
  const value = Math.round(toChips(cashoutBanks, ratio) * f * 10) / 10
  return (
    <div className="mt-2 flex items-baseline justify-between rounded-lg bg-surface-strong px-3 py-2.5">
      <span className="text-xs text-muted">Cash-out value</span>
      <span className="flex items-baseline gap-2">
        <span className="type-figure-md text-ink">{value.toLocaleString('en-US')}</span>
        <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-muted">× ½</span>
      </span>
    </div>
  )
}
