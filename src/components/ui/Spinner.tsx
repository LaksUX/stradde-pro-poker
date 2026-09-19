export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        className="opacity-90"
      />
    </svg>
  )
}

// The full-page loading state — replaces the bare "Loading…" text every
// screen used to show while its first fetch is in flight.
export function PageSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-muted">
      <Spinner className="h-6 w-6" />
    </div>
  )
}

// The inline variant for a screen that's already rendered and is fetching
// more (e.g. a background refresh) — keeps the "Loading…" label but pairs
// it with the same spinner instead of bare text.
export function InlineSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
      <Spinner className="h-4 w-4" />
      {label}
    </p>
  )
}
