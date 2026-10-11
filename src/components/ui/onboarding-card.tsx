import { useState } from 'react'
import { X } from 'lucide-react'

const KEY = (id: string) => `straddle:onboarding:${id}`

function dismissed(id: string): boolean {
  try {
    return localStorage.getItem(KEY(id)) === '1'
  } catch {
    return false
  }
}

// A quiet, one-time card: a title and two or three short lines. Dismissed
// for good once closed (kept on this phone).
export function OnboardingCard({
  id,
  title,
  items,
  className,
}: {
  id: string
  title: string
  items: { label: string; text: string }[]
  className?: string
}) {
  const [hidden, setHidden] = useState(() => dismissed(id))
  if (hidden) return null

  function close() {
    setHidden(true)
    try {
      localStorage.setItem(KEY(id), '1')
    } catch {
      // storage blocked: it will show again next visit
    }
  }

  return (
    <div className={`relative rounded-xl bg-surface-strong/60 px-4 py-3 ${className ?? ''}`}>
      <button
        type="button"
        onClick={close}
        aria-label="Dismiss"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-muted hover:text-ink"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="pr-8 text-sm font-semibold text-ink">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {items.map((it) => (
          <li key={it.label} className="text-xs text-muted">
            <span className="font-semibold text-body">{it.label}:</span> {it.text}
          </li>
        ))}
      </ul>
    </div>
  )
}
