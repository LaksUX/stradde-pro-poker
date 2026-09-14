// See PAGE_PROMPTS.md "The buy-in count picker" — one shared component
// behind every buy-in action, host and player alike. Minimum 1, per
// REQUIREMENTS.md's revised Money model (count is chosen, not fixed).

const QUICK_PICKS = [1, 2, 3, 5]

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
          <button
            key={n}
            onClick={() => onChange(n)}
            className={`rounded-full px-3.5 py-1.5 text-sm ${
              value === n ? 'bg-primary text-on-primary' : 'bg-surface-strong text-ink'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(clamp(value - 1))}
          className="h-9 w-9 flex-none rounded-full bg-surface-strong text-lg font-bold text-ink"
          aria-label="Decrease"
        >
          −
        </button>
        <input
          type="range"
          min={1}
          max={max}
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          className="flex-1 accent-primary"
        />
        <button
          onClick={() => onChange(clamp(value + 1))}
          className="h-9 w-9 flex-none rounded-full bg-surface-strong text-lg font-bold text-ink"
          aria-label="Increase"
        >
          +
        </button>
      </div>
    </div>
  )
}
