import { useState } from 'react'
import { Copy } from 'lucide-react'
import { formatChips, type ChipRatio } from '../../lib/chips'
import { toast } from '../../lib/toast'
import { cn } from 'cn'

export type ReportGame = {
  id: string
  name: string
  closed_at: string | null
  buyins: number
  rake: number
  chip_ratio: ChipRatio
}

// A host's report: closed games, buy-ins and rake for this month or all time,
// copyable as CSV. Amounts are banks, shown as chips like everywhere else.
export function HostReport({ games }: { games: ReportGame[] }) {
  const [period, setPeriod] = useState<'month' | 'all'>('month')
  const start = new Date()
  start.setDate(1)
  start.setHours(0, 0, 0, 0)
  const rows = games.filter(
    (g) => period === 'all' || (g.closed_at != null && new Date(g.closed_at).getTime() >= start.getTime())
  )
  const buyins = rows.reduce((s, g) => s + g.buyins, 0)
  const rake = rows.reduce((s, g) => s + g.rake, 0)

  async function copyCsv() {
    const lines = [
      'date,game,buy-ins,rake',
      ...rows.map((g) =>
        [
          g.closed_at ? new Date(g.closed_at).toISOString().slice(0, 10) : '',
          `"${g.name.replace(/"/g, '""')}"`,
          Math.round(g.buyins * 10000),
          Math.round(g.rake * 10000),
        ].join(',')
      ),
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      toast.success('Report copied as CSV')
    } catch {
      toast.error('Could not copy')
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-hairline-soft bg-canvas p-4">
      <div className="flex items-center justify-between">
        <h3 className="type-label-caption text-muted">Report</h3>
        <div className="flex gap-1 rounded-full bg-surface-strong/70 p-0.5">
          {(
            [
              ['month', 'This month'],
              ['all', 'All time'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setPeriod(k)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-semibold',
                period === k ? 'bg-canvas text-ink shadow-sm' : 'text-muted'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="type-figure-md text-ink">{rows.length}</p>
          <p className="text-xs text-muted">games</p>
        </div>
        <div>
          <p className="type-figure-md text-ink">{formatChips(buyins, '1:1')}</p>
          <p className="text-xs text-muted">buy-ins</p>
        </div>
        <div>
          <p className="type-figure-md text-ink">{formatChips(rake, '1:1')}</p>
          <p className="text-xs text-muted">rake</p>
        </div>
      </div>
      <button
        type="button"
        onClick={copyCsv}
        disabled={rows.length === 0}
        className="cta-soft mt-3 w-full gap-1.5 py-2 text-xs font-semibold text-muted hover:text-ink disabled:opacity-50"
      >
        <Copy className="h-3.5 w-3.5" /> Copy as CSV
      </button>
    </div>
  )
}
