import { ListRow } from './list-row'
import { NamedAvatar } from './avatar'
import { Badge } from './badge'
import { ChipsFigure } from './chips-figure'
import type { ChipRatio } from '../../lib/chips'

// One row shape for "my own settlement" everywhere it appears — My Game's
// per-game settlement section and My Settlements' across-every-game list.
// Avatar + name stay neutral; only the direction label and the figure
// carry win/error color, and never the word "chips" itself (ChipsFigure).
export function SettlementRow({
  otherName,
  direction,
  amount,
  ratio,
  status,
  context,
  onClick,
  className,
}: {
  otherName: string
  direction: 'owe' | 'owed'
  amount: number
  ratio: ChipRatio
  status: 'pending' | 'confirmed' | 'disputed'
  context?: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <ListRow
      className={onClick ? `cursor-pointer ${className ?? ''}` : className}
      onClick={onClick}
      avatar={<NamedAvatar name={otherName} className="h-12 w-12" />}
      title={otherName}
      subtitle={
        <>
          <span className={direction === 'owe' ? 'text-error' : 'text-win'}>
            {direction === 'owe' ? 'You owe' : 'Owed to you'}
          </span>
          {context && <> · {context}</>}
        </>
      }
      trailing={
        <>
          <ChipsFigure amount={amount} ratio={ratio} tone={direction === 'owe' ? 'error' : 'win'} />
          <Badge variant={status === 'confirmed' ? 'win' : status === 'disputed' ? 'error' : 'muted'}>
            {status}
          </Badge>
        </>
      }
    />
  )
}
