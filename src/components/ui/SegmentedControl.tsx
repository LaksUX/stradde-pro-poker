// DESIGN-dashboard.md's segmented-tab: a stadium-shaped row of options with
// the active one filled orange. Only used where a real either/or or
// multi-way state already exists in the product (rake masked/revealed,
// table status auto/open/full) — never added purely for decoration.
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="inline-flex gap-1 rounded-full bg-surface-strong p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors active:scale-95 ${
            value === opt.value ? 'bg-primary text-on-primary' : 'text-muted hover:text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
