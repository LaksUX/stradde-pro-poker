import { cn } from "cn"

// A WhatsApp-chat-list-shaped row: a big avatar on the left, a bold title +
// muted subtitle stacked under it, and a right-aligned trailing column
// (typically a figure on top, a badge/status underneath) — no column
// headers, no per-cell borders. Replaces the app's Table for every list
// that's really "browse a set of named rows," which is most of them; Table
// itself stays for the couple of spots that are still genuinely tabular
// (Settlement's From/To editor).
function ListGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="list-group"
      className={cn(
        "divide-y divide-hairline-soft overflow-hidden rounded-lg border border-hairline bg-canvas",
        className
      )}
      {...props}
    />
  )
}

function ListRow({
  avatar,
  meta,
  title,
  subtitle,
  trailing,
  className,
  ...props
}: {
  avatar?: React.ReactNode
  // A small line above the title — same slot, same styling, everywhere it's
  // used. Its one real use so far is a date: when a row's date matters
  // enough to lead with (a closed game's "when," not an incidental detail
  // buried under the title), it goes here instead of in the subtitle.
  meta?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  trailing?: React.ReactNode
} & Omit<React.ComponentProps<"div">, "title">) {
  return (
    <div
      data-slot="list-row"
      className={cn(
        "flex items-center gap-3 px-3 py-3 transition-colors hover:bg-surface-strong/60",
        className
      )}
      {...props}
    >
      {avatar && <div className="shrink-0">{avatar}</div>}
      <div className="min-w-0 flex-1">
        {meta && <div className="truncate text-xs text-muted">{meta}</div>}
        <div className="truncate text-[15px] font-semibold text-ink">{title}</div>
        {subtitle && <div className="mt-0.5 truncate text-sm text-muted">{subtitle}</div>}
      </div>
      {trailing && (
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">{trailing}</div>
      )}
    </div>
  )
}

export { ListGroup, ListRow }
