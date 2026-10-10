import { formatChips, toChips, valueFactor, type ChipRatio } from '../../lib/chips'
import { cn } from 'cn'

function signed(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US')
  return n > 0 ? `+${abs}` : n < 0 ? `−${abs}` : '0'
}

// Maps one player's buy-ins and counted chips to their result, side by side:
// the chips as they sit on the table, and what they are worth at this table's
// ratio. Amounts are banks (chips / 10,000), like everywhere else.
export function ConversionTable({
  buyinBanks,
  cashoutBanks,
  ratio,
}: {
  buyinBanks: number
  cashoutBanks: number
  ratio: ChipRatio
}) {
  const f = valueFactor(ratio)
  const half = f !== 1
  const resultBanks = cashoutBanks - buyinBanks
  const val = (banks: number) => Math.round(toChips(banks, ratio) * f)
  const tone = (n: number) => (n > 0 ? 'text-win' : n < 0 ? 'text-error' : 'text-ink')

  return (
    <div className="mt-3 rounded-lg bg-surface-strong px-3 py-2.5 text-sm">
      <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 gap-y-1">
        <span />
        <span className="text-right text-[11px] font-semibold uppercase tracking-wide text-muted">Chips</span>
        {half ? (
          <span className="text-right text-[11px] font-semibold uppercase tracking-wide text-muted">Value × ½</span>
        ) : (
          <span />
        )}

        <span className="text-muted">Bought in</span>
        <span className="text-right text-ink">{formatChips(buyinBanks, ratio)}</span>
        {half ? <span className="text-right text-ink">{val(buyinBanks).toLocaleString('en-US')}</span> : <span />}

        <span className="text-muted">Cash-out</span>
        <span className="text-right text-ink">{formatChips(cashoutBanks, ratio)}</span>
        {half ? <span className="text-right text-ink">{val(cashoutBanks).toLocaleString('en-US')}</span> : <span />}

        <span className="font-semibold text-ink">Result</span>
        <span className={cn('text-right font-semibold', tone(resultBanks))}>
          {signed(toChips(resultBanks, ratio))}
        </span>
        {half ? (
          <span className={cn('text-right font-semibold', tone(resultBanks))}>{signed(val(resultBanks))}</span>
        ) : (
          <span />
        )}
      </div>
    </div>
  )
}
