import { Loader2 } from "lucide-react"
import { cn } from "cn"

function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      role="status"
      aria-label="Loading"
      className={cn("h-5 w-5 animate-spin", className)}
    />
  )
}

// Full-page loading state shown while a screen's first fetch is in flight.
function PageSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center text-muted">
      <Spinner className="h-6 w-6" />
    </div>
  )
}

// Inline variant for an already-rendered screen that is fetching more.
function InlineSpinner({ label = "Loading…" }: { label?: string }) {
  return (
    <p className="mt-4 flex items-center justify-center gap-2 text-sm text-muted">
      <Spinner className="h-4 w-4" />
      {label}
    </p>
  )
}

export { Spinner, PageSpinner, InlineSpinner }
