import { Button } from './button'
import { Slider } from './slider'

const QUICK_PICKS = [1, 2, 3, 5]

// One shared component behind every buy-in action. Minimum 1; count is
// chosen, not fixed (see REQUIREMENTS.md's Money model).
export function BuyinPicker({
  value,
  onChange,
  max = 30,
}: {
  value: number
  onChange: (n: number) => void
  max?: number
}) {
  const clamp = (n: number) => Math.max(1, Math.min(max, n))

  return (
    <div className="my-3">
      <div className="text-center text-[34px] font-bold text-ink">{value}</div>
      <div className="mb-2 flex justify-center gap-1.5">
        {QUICK_PICKS.map((n) => (
          <Button
            key={n}
            type="button"
            variant={value === n ? 'default' : 'secondary'}
            className="h-auto rounded-full px-3.5 py-1.5 text-sm"
            onClick={() => onChange(n)}
          >
            {n}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-9 w-9 flex-none rounded-full text-lg font-bold"
          onClick={() => onChange(clamp(value - 1))}
          aria-label="Decrease"
        >
          −
        </Button>
        <Slider
          min={1}
          max={max}
          value={value}
          onValueChange={(v) => onChange(clamp(Array.isArray(v) ? v[0] : v))}
          className="flex-1"
        />
        <Button
          type="button"
          variant="secondary"
          size="icon"
          className="h-9 w-9 flex-none rounded-full text-lg font-bold"
          onClick={() => onChange(clamp(value + 1))}
          aria-label="Increase"
        >
          +
        </Button>
      </div>
    </div>
  )
}
