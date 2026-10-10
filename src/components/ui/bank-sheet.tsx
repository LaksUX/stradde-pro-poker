import { formatChips, netValue, valueFactor, type ChipRatio } from '../../lib/chips'
import { cn } from 'cn'

export type BankSheetRow = { id: string; name: string; buyins: number; cashout: number | null }

function signed(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US')
  return n > 0 ? `+${abs}` : n < 0 ? `−${abs}` : '0'
}

// The bank sheet: how a night's chips turn into results. Chips are what sat on
// the table (buy-ins in, chips counted at cash-out). The result is the value:
// chip result x 1 at a 1:1 table, x 1/2 at a 1:2 table. One unit per column,
// each labelled, so a 1:2 table never mixes the two.
export function BankSheet({
  rows,
  stake,
  ratio,
}: {
  rows: BankSheetRow[]
  stake: number
  ratio: ChipRatio
}) {
  const half = valueFactor(ratio) !== 1
  const totalIn = rows.reduce((s, r) => s + r.buyins * stake, 0)
  const totalOut = rows.reduce((s, r) => s + (r.cashout ?? 0), 0)

  return (
    <section className="mt-4 overflow-hidden rounded-lg border border-hairline bg-canvas">
      <div className="border-b border-hairline px-4 py-3">
        <h2 className="type-label-caption text-muted">Bank sheet</h2>
        <p className="mt-1 text-xs text-muted">
          {half
            ? '1:2 table. Chips are counted as they are; each result below is the chip result at half value.'
            : 'Chips are counted as they are; each result below is the chip result at full value.'}
        </p>
      </div>
      <ul className="divide-y divide-hairline-soft">
        {rows.map((r) => {
          const inChips = r.buyins * stake
          const done = r.cashout != null
          const chipResult = done ? (r.cashout as number) - inChips : 0
          const value = done ? netValue(r.cashout as number, inChips, ratio) : 0
          return (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{r.name}</p>
                <p className="mt-0.5 text-xs text-muted">
                  In {formatChips(inChips, ratio)} · {done ? `Counted ${formatChips(r.cashout as number, ratio)}` : 'Still playing'}
                </p>
              </div>
              {done ? (
                <div className="text-right">
                  <p className={cn('type-figure-md', value > 0 ? 'text-win' : value < 0 ? 'text-error' : 'text-muted')}>
                    {signed(Math.round(value * 10000))}
                  </p>
                  {half && (
                    <p className="text-[11px] text-muted">
                      {signed(Math.round(chipResult * 10000))} × ½
                    </p>
                  )}
                </div>
              ) : (
                <span className="text-sm text-muted">In play</span>
              )}
            </li>
          )
        })}
      </ul>
      <div className="flex items-center justify-between border-t border-hairline bg-surface-soft px-4 py-2.5 text-xs text-muted">
        <span>Chips in {formatChips(totalIn, ratio)}</span>
        <span>Chips counted {formatChips(totalOut, ratio)}</span>
      </div>
    </section>
  )
}
