import { formatChips, netValue, toChips, valueFactor, type ChipRatio } from '../../lib/chips'
import { cn } from 'cn'

function signed(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US')
  return n > 0 ? `+${abs}` : n < 0 ? `−${abs}` : '0'
}

// Shown under the chip-count box. You type chips; this shows the player's
// result. At a 1:2 table it also shows the sum ("counted − bought in") and the
// ½, so the count can be checked at a glance. Amounts are banks.
export function ConversionTable({
  buyinBanks,
  cashoutBanks,
  ratio,
}: {
  buyinBanks: number
  cashoutBanks: number
  ratio: ChipRatio
}) {
  const half = valueFactor(ratio) !== 1
  const chipDiff = cashoutBanks - buyinBanks
  const result = Math.round(toChips(netValue(cashoutBanks, buyinBanks, ratio), ratio) * 10) / 10
  const tone = result > 0 ? 'text-win' : result < 0 ? 'text-error' : 'text-ink'

  return (
    <div className="mt-2 rounded-lg bg-surface-strong px-3 py-2.5">
      {half && (
        <p className="text-xs text-muted">
          {formatChips(cashoutBanks, ratio)} − {formatChips(buyinBanks, ratio)} ={' '}
          {chipDiff < 0 ? '−' : ''}
          {formatChips(Math.abs(chipDiff), ratio)} chips
        </p>
      )}
      <div className={cn('flex items-baseline justify-between', half && 'mt-1')}>
        <span className="text-sm font-semibold text-ink">Result</span>
        <span className="flex items-baseline gap-2">
          <span className={cn('type-figure-md', tone)}>{signed(result)}</span>
          {half && (
            <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-muted">× ½</span>
          )}
        </span>
      </div>
    </div>
  )
}
